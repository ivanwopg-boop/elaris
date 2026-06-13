"""Chat / Write / Advise API routes with streaming + conversation persistence."""

import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db
from app.models.db_models import Persona, PersonaSoul, Conversation as ConvTable, ConversationMessage
from app.models.schemas import ChatRequest, ChatResponse
from app.core.minimax_client import minimax_client
from app.core.prompts import CHAT_SYSTEM_PROMPT
from app.api.v1.chat_utils import needs_web_search
from app.services.web_search import search_web
from app.services.memory_service import get_memory_context, generate_memory_summary
from app.core.auth_deps import require_auth, require_auth_optional
from app.core.safety_filter import check_input, check_output, check_restricted_output
from app.core.auth import decode_token
from app.models.db_models import User

# === Output sanitizer: remove bracketed stage directions ===
import re as _re

# Only match bracketed emotion/action descriptions: (smiles) （叹气）(winks)
_BRACKET_RE = _re.compile(r'[\(（][^)）]{1,40}?[\)）]')

def _sanitize_reply(text: str) -> str:
    """Remove bracketed stage directions and markdown formatting from AI reply."""
    if not text:
        return text
    # Remove bracketed actions/emotions: (smiling) （叹气）
    text = _BRACKET_RE.sub("", text)
    # Remove markdown bold/italic: **text** __text__ *text* _text_
    text = _re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # **bold**
    text = _re.sub(r"__(.+?)__", r"\1", text)          # __bold__
    text = _re.sub(r"\*(.+?)\*", r"\1", text)         # *italic*
    text = _re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", text)  # _italic_ (not in words)
    # Remove markdown headers: ### Title
    text = _re.sub(r"^#{1,6}\s+", "", text, flags=_re.MULTILINE)
    # Remove markdown links but keep text: [text](url) -> text
    text = _re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Collapse multiple spaces
    text = _re.sub(r" {2,}", " ", text)
    return text.strip()


from fastapi.responses import JSONResponse

router = APIRouter(prefix="", tags=["Chat"])


# ── Output schemas ───────────────────────────────────────────

class ConversationListOut(BaseModel):
    id: str
    persona_id: str
    persona_name: str
    persona_avatar: str | None
    last_message: str | None
    updated_at: datetime
    type: str = "single"
    name: str | None = None
    participant_ids: list[str] = []


# ── Conversation helpers ───────────────────────────────────────

async def _get_or_create_conversation(user_id: str, persona_id: str, db: AsyncSession) -> str:
    """Get existing conversation or create a new one. Returns conversation_id."""
    result = await db.execute(
        select(ConvTable).where(ConvTable.user_id == user_id, ConvTable.persona_id == persona_id)
    )
    conv = result.scalar_one_or_none()
    if conv:
        return conv.id
    conv_id = str(uuid.uuid4())
    conv = ConvTable(id=conv_id, user_id=user_id, persona_id=persona_id)
    db.add(conv)
    await db.flush()
    return conv_id


async def _save_message(
    conversation_id: str,
    user_id: str,
    persona_id: str,
    role: str,  # "user" or "assistant"
    content: str,
    db: AsyncSession,
):
    msg_id = str(uuid.uuid4())
    msg = ConversationMessage(
        id=msg_id,
        conversation_id=conversation_id,
        user_id=user_id,
        persona_id=persona_id,
        role=role,
        content=content,
        created_at=datetime.utcnow(),
    )
    db.add(msg)
    # Update conversation updated_at
    result = await db.execute(select(ConvTable).where(ConvTable.id == conversation_id))
    conv = result.scalar_one()
    conv.updated_at = datetime.utcnow()
    await db.flush()
    return msg_id


# ── Soul fetch ────────────────────────────────────────────────

async def _get_soul(persona_id: str, db: AsyncSession) -> dict:
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    soul_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    soul = soul_result.scalars().first()
    if not soul:
        raise HTTPException(status_code=400, detail="Persona has no soul yet. Run distillation first.")
    return {"name": persona.name, "source_name": persona.source_name or "", "soul_json": soul.soul_json, "soul": json.loads(soul.soul_json)}


async def _sse_event(event_name: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {payload}\n\n"


# ── SSE streaming endpoints ──────────────────────────────────

def _get_user_from_request(request) -> str | None:
    """Extract user_id from access_token cookie or query param (SSE can't send cookies)."""
    token = request.cookies.get("access_token")
    if not token:
        token = request.query_params.get("token")
    if not token:
        return None
    payload = decode_token(token)
    return payload.get("sub") if payload else None


@router.get("/chat/{persona_id}/stream")
async def chat_stream(persona_id: str, message: str, conv: str = None, request: Request = None, db: AsyncSession = Depends(get_db)):
    # Allow guests to chat with preset personas only
    user_id = _get_user_from_request(request)
    if not user_id:
        # Guest: verify persona is a preset (user_id=NULL)
        from app.models.db_models import Persona
        pr = await db.execute(select(Persona).where(Persona.id == persona_id))
        persona = pr.scalars().first()
        if not persona or persona.user_id is not None:
            raise HTTPException(status_code=403, detail="Login required for this persona")

    # Safety filter: check input before processing
    safety = check_input(message)
    if not safety["safe"]:
        async def _safety_gen():
            yield f"event: chat_message\ndata: {json.dumps({"content": safety["message"]})}\n\n"
            yield f"event: done\ndata: {json.dumps({})}\n\n"
        return StreamingResponse(_safety_gen(), media_type="text/event-stream")

    info = await _get_soul(persona_id, db)
    # ── Smart search: template queries + direct snippet injection ──
    search_context = ""
    try:
        import logging, re; _log = logging.getLogger("uvicorn")
        _now = datetime.now()
        _today = _now.strftime("%Y-%m-%d")
        _year = str(_now.year)

        search_person_name = info.get('source_name') or info['name']

        # Smart search trigger: clean message but keep meaningful short follow-ups
        import re as _re
        _clean = _re.sub(r'@\w+', '', message).strip()  # remove @mentions
        _pure_greeting = bool(_re.match(r'^(hi|hello|hey|你好|大家好|哈喽|嗨|yo|sup|好|ok|嗯+|哈哈+)[!!.?？~～]*$', _clean, _re.IGNORECASE))
        _search_msg = None if _pure_greeting else (_clean if len(_clean) >= 2 else None)

        # Build search context from recent conversation (for follow-up questions)
        _search_ctx = ""
        if conv:
            try:
                _ctx_rows = await db.execute(
                    select(ConversationMessage)
                    .where(ConversationMessage.conversation_id == conv)
                    .order_by(ConversationMessage.created_at.desc())
                    .limit(4)
                )
                _recent_msgs = list(reversed(_ctx_rows.scalars().all()))
                _search_ctx = " | ".join(
                    f"{'User' if m.role == 'user' else 'AI'}: {m.content[:80]}"
                    for m in _recent_msgs
                )
            except:
                pass

        # Generate smart search queries
        _search_queries = []
        if _search_msg:
            _qp_parts = [
                f"User is chatting with AI persona of {search_person_name}.",
                f"User said: {_search_msg}",
            ]
            if _search_ctx:
                _qp_parts.append(f"Recent context: {_search_ctx[:300]}")
            _qp_parts.extend([
                f"Generate 3 SHORT search queries (max 50 chars each) to find current info.",
                f"Rules: persona name + key topic + year {datetime.now().year}",
                "Match user language (Chinese/English).",
                "3 lines only. No numbering. No explanation.",
            ])
            _qp = "\n".join(_qp_parts)
            try:
                _qr = await minimax_client.chat(
                    [{"role": "user", "content": _qp}], temperature=0.1, max_tokens=150
                )
                _q_lines = [l.strip() for l in _qr.strip().split("\n") if l.strip() and 5 < len(l.strip()) < 80]
                _q_lines = [q for q in _q_lines if not q.startswith(('THINK','Think','Here','Below','query','I ','You ','-','*','#','1.','2.','3.'))]
                _search_queries = _q_lines[:3]
            except:
                pass

            if not _search_queries:
                _search_queries = [f"{search_person_name} {_search_msg[:30]} {datetime.now().year}"]

            _log.info(f"[SEARCH_Q] msg={message[:30]!r} ctx={'yes' if _search_ctx else 'no'} -> {_search_queries}")
        else:
            _log.info(f"[SEARCH_Q] skipped (greeting): {message[:30]!r}")

        # Step 3: Execute searches in parallel
        sr = await search_web(_search_queries)
        if sr:
            _seen_urls = set()
            _all_results = []
            for _q_result in sr:
                for r in _q_result.get("results", []):
                    _url = r.get("url", "")
                    if _url and _url not in _seen_urls and r.get("snippet"):
                        _seen_urls.add(_url)
                        _all_results.append(r)
            _all_results = _all_results[:12]

            if _all_results:
                # Step 4: Direct snippet injection — no LLM extraction loss
                _lines = []
                for i, r in enumerate(_all_results[:10]):
                    _t = r.get('title', '')[:120]
                    _s = r.get('snippet', '')[:250]
                    _lines.append(f"- {_t}\n  {_s}")
                search_context = "\n### Latest web results (ordered by relevance):\n" + "\n".join(_lines)
                _log.info(f"[SEARCH] {len(_all_results)} results -> {len(search_context)} chars")
    except Exception as _search_err:
        import logging; logging.getLogger("uvicorn").error(f"[SEARCH_ERROR] {_search_err}")


    import logging; logging.getLogger("uvicorn").info(f"[SEARCH_DEBUG] context_len={len(search_context)}, preview={repr(search_context[:150])}")
    # Restricted mode: gentle session reminder
    restricted_reminder = ""
    if user_id:
        from app.models.db_models import User as _UM
        _ur2 = await db.execute(select(_UM).where(_UM.id == user_id))
        _u2 = _ur2.scalars().first()
        if _u2 and _u2.tier == "restricted":
            restricted_reminder = "\n8. USER IS A MINOR (13-16): Keep responses age-appropriate. Avoid mature themes. Gently suggest breaks every so often."

    # Inject persona memory (Phase 1: Bond System)
    _memory_ctx = await get_memory_context(persona_id, user_id, db)

    system_prompt = CHAT_SYSTEM_PROMPT.format(
            current_date=datetime.now().strftime("%Y-%m-%d"),
        name=info["name"],
        search_context=search_context + restricted_reminder,
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        memory_context=_memory_ctx,
    )

    # ── Context gate: only load history when the message needs it ──
    history_msgs = []
    if conv:
        try:
            _gate_prompt = "A user in a chat sent this message: '" + message + "'. Does this message require remembering the PREVIOUS conversation context to understand and answer properly? Examples: 'tell me more' = YES, 'what about X' where X was just mentioned = YES, 'what is the capital of France?' = NO, 'who is Elon Musk?' = NO. Reply exactly one word: YES or NO."
            _gate_resp = await minimax_client.chat(
                [{"role": "user", "content": _gate_prompt}],
                temperature=0.0, max_tokens=5
            )
            _needs_context = "YES" in _gate_resp.upper().strip()
        except Exception:
            _needs_context = True  # safe default: include history on failure
        
        if _needs_context:
            from app.models.db_models import ConversationMessage
            hres = await db.execute(
                select(ConversationMessage).where(ConversationMessage.conversation_id == conv)
                .order_by(ConversationMessage.created_at.desc()).limit(10)
            )
            for hm in reversed(hres.scalars().all()):
                history_msgs.append({"role": hm.role, "content": hm.content})


    # Inject search results into user message (models respect user input far more than system instructions)
    user_content = message
    if search_context.strip():
        user_content = f"""{message}

---
[Background context for {info['name']} to reference when answering]:
{search_context}
Please factor in the above information when responding."""

    msgs = [
        {"role": "system", "content": system_prompt},
    ] + history_msgs + [
        {"role": "user", "content": user_content},
    ]

    user_id = _get_user_from_request(request)
    conv_id = None
    user_msg_id = None
    if user_id:
        conv_id = await _get_or_create_conversation(user_id, persona_id, db)
        user_msg_id = await _save_message(conv_id, user_id, persona_id, "user", message, db)

    async def event_gen():
        nonlocal user_msg_id
        try:
            reply = await minimax_client.chat(msgs, temperature=0.4, max_tokens=10000)
            reply = _sanitize_reply(reply)
            # Safety filter: check output for boundary violations
            out_check = check_output(reply)
            if not out_check["safe"]:
                reply = out_check["message"]
            # Restricted mode: extra checks for 13-16 users
            if user_id:
                from app.models.db_models import User
                _ur = await db.execute(select(User).where(User.id == user_id))
                _u = _ur.scalars().first()
                if _u and _u.tier == "restricted":
                    _rc = check_restricted_output(reply)
                    if not _rc["safe"]:
                        reply = _rc["message"]
            assistant_msg_id = None
            if conv_id and user_id:
                assistant_msg_id = await _save_message(conv_id, user_id, persona_id, "assistant", reply, db)
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {"user_msg_id": user_msg_id, "assistant_msg_id": assistant_msg_id})

            # Phase 1: Generate conversation summary (async, non-blocking)
            try:
                _conv_msgs = await db.execute(
                    select(ConversationMessage)
                    .where(ConversationMessage.conversation_id == conv_id)
                    .order_by(ConversationMessage.created_at.desc())
                    .limit(10)
                )
                _recent = list(reversed(_conv_msgs.scalars().all()))
                _conv_text = "\n".join(
                    f"{'User' if m.role == 'user' else 'AI'}: {m.content[:200]}"
                    for m in _recent
                )
                if len(_conv_text) > 50:  # only summarize if there's substance
                    await generate_memory_summary(persona_id, user_id, _conv_text, db, minimax_client)
            except Exception as _me:
                _log.warning(f"[MEMORY] Post-chat summary failed: {_me}")
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ── Blocking endpoints ────────────────────────────────────────

async def _handle_mode(request: ChatRequest, user_id: str, db: AsyncSession, user_tier: str = "free") -> ChatResponse:
    # Safety filter: check input
    safety = check_input(request.message)
    if not safety["safe"]:
        return ChatResponse(message=safety["message"], sources=["safety"], style_match=0.0)
    info = await _get_soul(request.persona_id, db)
    search_person_name_ns = info.get('source_name') or info['name']

    # ── Conversation memory (L1): recent conversation summary ──
    memory_context = ""
    try:
        mem_result = await db.execute(
            select(ConversationMessage.content, ConversationMessage.role, ConversationMessage.created_at)
            .join(ConvTable, ConversationMessage.conversation_id == ConvTable.id)
            .where(ConvTable.user_id == user_id, ConvTable.persona_id == request.persona_id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(10)
        )
        mem_rows = mem_result.all()
        if mem_rows:
            turns = []
            for r in reversed(mem_rows):
                role = r[1]
                content = r[0][:150].replace(chr(34), chr(39)).replace(chr(92)+"n", " ")
                if content.strip():
                    prefix = "User" if role == "user" else "AI"
                    turns.append(prefix + ": " + content)
            if turns:
                memory_context = "Previous conversation: " + " | ".join(turns[::-1][-6:])
    except Exception:
        pass

    # Smart search trigger
    import re as _re_ns
    _clean_ns = _re_ns.sub(r'@\w+', '', request.message).strip()
    _pure_greeting_ns = bool(_re_ns.match(r'^(hi|hello|hey|你好|大家好|哈喽|嗨|yo|sup|好|ok|嗯+|哈哈+)[!!.?？~～]*$', _clean_ns, _re_ns.IGNORECASE))
    _search_msg_ns = None if _pure_greeting_ns else (_clean_ns if len(_clean_ns) >= 2 else None)

    # Build search context from conversation history
    _search_ctx_ns = ""
    try:
        _ctx_q = await db.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conv_id) if conv_id else None
        )
    except:
        pass
    if memory_context:
        _search_ctx_ns = memory_context[:300]

    # Generate queries
    _search_queries_ns = []
    if _search_msg_ns:
        _qp = (
            f"User chatting with AI persona of {search_person_name_ns}. "
            f"User said: \"{_search_msg_ns}\"\n"
        )
        if _search_ctx_ns:
            _qp += f"Recent: {_search_ctx_ns[:200]}\n"
        _qp += (
            f"Generate 3 SHORT search queries (max 50 chars). "
            f"Rules: persona name + topic + {datetime.now().year}. "
            f"Match user language. 3 lines only, no numbering."
        )
        try:
            _qr_ns = await minimax_client.chat(
                [{"role": "user", "content": _qp}], temperature=0.1, max_tokens=150
            )
            _queries = [l.strip() for l in _qr_ns.strip().split("\n") if l.strip() and 5 < len(l.strip()) < 80]
            _queries = [q for q in _queries if not q.startswith(('THINK','Think','Here','Below','query','I ','You ','-','*','#','1.','2.','3.'))]
            _search_queries_ns = _queries[:3]
        except:
            pass

        if not _search_queries_ns:
            _search_queries_ns = [f"{search_person_name_ns} {_search_msg_ns[:30]} {datetime.now().year}"]
    else:
        _search_queries_ns = []

    search_context = ""
    try:
        # Execute searches in parallel
        sr = await search_web(_search_queries_ns)
        if sr:
            _seen_urls = set()
            _all_results = []
            for _q_result in sr:
                for r in _q_result.get("results", []):
                    _url = r.get("url", "")
                    if _url and _url not in _seen_urls and r.get("snippet"):
                        _seen_urls.add(_url)
                        _all_results.append(r)
            if _all_results:
                sc_parts = ["\n### Latest web results (retrieved just now):"]
                _has_dates = False
                for r in _all_results[:8]:
                    _t = r.get('title','')[:120]
                    _s = r.get('snippet','')[:250]
                    sc_parts.append(f"- {_t}\n  {_s}")
                    if _re_ns.search(r'\d{4}[-/年]\d{1,2}', _t + _s):
                        _has_dates = True
                search_context = "\n".join(sc_parts)
                if not _has_dates:
                    search_context += "\n\n⚠️ CRITICAL: No verified dates found in these results. Do NOT fabricate dates, venues, or schedules. Say you don't have confirmed information if asked about specific events."
    except Exception:
        pass
    # Inject persona memory (Phase 1: Bond System)
    _memory_ctx = await get_memory_context(request.persona_id, user_id, db)
    system_prompt = CHAT_SYSTEM_PROMPT.format(
        current_date=datetime.now().strftime("%Y-%m-%d"),
        name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        memory_context=memory_context + "\n" + _memory_ctx if _memory_ctx else memory_context,
        search_context=search_context,
    )
    user_msg = request.message
    if search_context.strip():
        user_msg = f"""{request.message}

---
[Background context for {info['name']} to reference when answering]:
{search_context}
Please factor in the above information when responding."""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_msg}]
    conv_id = await _get_or_create_conversation(user_id, request.persona_id, db)
    await _save_message(conv_id, user_id, request.persona_id, "user", request.message, db)
    reply = await minimax_client.chat(messages, temperature=0.4, max_tokens=10000)
    reply = _sanitize_reply(reply)
    # Safety filter: check output for boundary violations
    out_check = check_output(reply)
    if not out_check["safe"]:
        reply = out_check["message"]
    # Restricted mode: extra checks
    if user_tier == "restricted":
        _rc = check_restricted_output(reply)
        if not _rc["safe"]:
            reply = _rc["message"]
    await _save_message(conv_id, user_id, request.persona_id, "assistant", reply, db)

    # Phase 1: Generate conversation summary (best-effort, don't block response)
    try:
        _conv_msgs = await db.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conv_id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(10)
        )
        _recent = list(reversed(_conv_msgs.scalars().all()))
        _conv_text = "\n".join(
            f"{'User' if m.role == 'user' else 'AI'}: {m.content[:200]}"
            for m in _recent
        )
        if len(_conv_text) > 50:
            await generate_memory_summary(request.persona_id, user_id, _conv_text, db, minimax_client)
    except Exception as _me:
        pass  # Don't fail the response over memory issues

    return ChatResponse(message=reply, sources=["L3"], style_match=0.85)

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    request.mode = "chat"
    return await _handle_mode(request, user.id, db, user.tier)


# ── Conversation list & delete ────────────────────────────────

@router.post("/conversations", response_model=ConversationListOut)
async def create_conversation(
    request: dict,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Create a new conversation (single or group). For group, supply name + participant_ids."""
    conv_type = request.get("type", "single")
    name = request.get("name")
    participant_ids = request.get("participant_ids", [])
    
    if conv_type == "group":
        # For group chat, primary persona_id is the first participant or null
        primary_persona_id = participant_ids[0] if participant_ids else None
        conversation = ConvTable(
            id=f"grp_{uuid.uuid4().hex[:24]}",
            user_id=user.id,
            persona_id=primary_persona_id,
            type="group",
            name=name or "Group Chat",
            participant_ids=json.dumps(participant_ids),
        )
    else:
        persona_id = request.get("persona_id")
        if not persona_id:
            raise HTTPException(status_code=400, detail="persona_id required for single chat")
        conversation = ConvTable(
            id=f"conv_{uuid.uuid4().hex[:24]}",
            user_id=user.id,
            persona_id=persona_id,
            type="single",
        )
    
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    
    return ConversationListOut(
        id=conversation.id,
        persona_id=conversation.persona_id,
        persona_name=name if conv_type == "group" else "",
        persona_avatar=None,
        last_message=None,
        updated_at=conversation.updated_at,
        type=conversation.type,
        name=conversation.name,
        participant_ids=participant_ids,
    )



@router.get("/conversations", response_model=list[ConversationListOut])
async def list_conversations(user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """List all conversations for the current user, with last message preview."""
    result = await db.execute(
        select(ConvTable, Persona)
        .join(Persona, ConvTable.persona_id == Persona.id)
        .where(ConvTable.user_id == user.id)
        .order_by(ConvTable.updated_at.desc())
    )
    rows = result.all()
    conversations = []
    for conv, persona in rows:
        # Get last message preview
        msg_result = await db.execute(
            select(ConversationMessage.content)
            .where(ConversationMessage.conversation_id == conv.id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()
        participant_ids = []
        if conv.participant_ids:
            try:
                participant_ids = json.loads(conv.participant_ids)
            except:
                pass
        conversations.append(ConversationListOut(
            id=conv.id,
            persona_id=conv.persona_id,
            persona_name=conv.name if conv.type == "group" else persona.name,
            persona_avatar=persona.avatar_url if conv.type != "group" else None,
            last_message=last_msg,
            updated_at=conv.updated_at,
            type=conv.type or "single",
            name=conv.name,
            participant_ids=participant_ids,
        ))
    return conversations


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Delete a conversation and all its messages."""
    # Verify ownership
    result = await db.execute(
        select(ConvTable).where(ConvTable.id == conversation_id, ConvTable.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # Delete messages first
    await db.execute(delete(ConversationMessage).where(ConversationMessage.conversation_id == conversation_id))
    # Delete conversation
    await db.execute(delete(ConvTable).where(ConvTable.id == conversation_id))
    await db.flush()

@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get all messages for a specific conversation."""
    import logging
    logger = logging.getLogger("uvicorn")
    logger.info(f"[GET_MESSAGES] conv_id={conversation_id}, user_id={user.id if user else None}")
    # Verify ownership
    result = await db.execute(
        select(ConvTable).where(ConvTable.id == conversation_id, ConvTable.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        logger.warning(f"[GET_MESSAGES] Conversation {conversation_id} not found for user {user.id if user else None}")
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get messages
    msg_result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
    )
    messages = msg_result.scalars().all()

    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]

@router.delete("/conversations/{conversation_id}/messages/{message_id}", status_code=204)
async def delete_message(
    conversation_id: str,
    message_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Delete a single message from a conversation."""
    result = await db.execute(
        select(ConvTable).where(ConvTable.id == conversation_id, ConvTable.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.execute(
        delete(ConversationMessage).where(
            ConversationMessage.id == message_id,
            ConversationMessage.conversation_id == conversation_id
        )
    )
    await db.flush()
