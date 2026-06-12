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
    return {"name": persona.name, "soul_json": soul.soul_json, "soul": json.loads(soul.soul_json)}


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
    # Always search (self-hosted, unlimited) — use multiple queries for better coverage
    search_context = ""
    try:
        import logging; _log = logging.getLogger("uvicorn")
        _now = datetime.now()
        _today = _now.strftime("%Y-%m-%d")

        # Step 1: LLM reformulates user question into search keywords
        _rp = "Search keywords: " + info['name'] + " OR " + info['name'] + ". Question to research: '" + message + "'. Current date: " + _today + ". Give me ONLY two search-engine-ready query strings, exactly like:  'keyword1 keyword2 keyword3 2026'. Use " + info['name'] + "'s real name. Factor in that we are past " + _today + ". Your ENTIRE RESPONSE must be exactly 2 lines, each line a search query. No explanations, no thinking, no prefix."
        _rr = await minimax_client.chat(
            [{"role": "user", "content": _rp}], temperature=0.1, max_tokens=150
        )
        _rlines = [l.strip() for l in _rr.strip().split("\n") if l.strip()]
        # Filter out LLM narration lines — only keep lines that look like search queries
        _bad_prefixes = ('we need', 'we should', 'the question', 'the user', 'possible',
                         'interpret', 'so we', 'so the', 'use real', 'first query',
                         'second query', 'query 1', 'query 2', 'we can', 'here are',
                         'let me', 'i need', 'i will', 'output',
                         '我们需要', '问题', '可以', '这样', '首先', '然后')
        _lowered = [l.lower() for l in _rlines]
        _kept = [l for i, l in enumerate(_rlines)
                 if not _lowered[i].startswith(_bad_prefixes)
                 and len(l) >= 10
                 and 'keyword' not in _lowered[i]]
        if len(_kept) >= 2:
            _search_queries = _kept[:2]
        else:
            # Smart fallback: extract key topic words from user message
            _topic_words = []
            for _w in (message + " ").replace("?", " ").replace("？", " ").replace("!", " ").split():
                _w = _w.strip()
                if len(_w) >= 2 and _w not in ("你", "我", "他", "她", "的", "了", "吗", "呢", "啊", "吧", "是", "在", "有", "不", "就", "也", "还", "都", "要", "会", "能", "可以", "什么", "怎么", "为什么", "哪个", "哪里", "谁", "什么时候", "有没有", "是不是", "能不能", "现在", "最近", "最新", "一下", "今天", "昨天", "明天"):
                    if _w not in _topic_words:
                        _topic_words.append(_w)
            _topics = " ".join(_topic_words[:3])
            _search_queries = [
                info['name'] + " " + _topics + " " + str(_now.year),
                info['name'] + " " + _topics
            ]
        _log.info(f"[SEARCH_Q] raw={message[:40]!r} -> {_search_queries}")

        # Step 2: Broad search (up to 15 results via Exa)
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
            _all_results = _all_results[:15]
            if _all_results:
                # Step 3: Extract key facts from search results
                _raw_results = "\n".join(["- " + r['title'] + " | " + r['snippet'][:300] for r in _all_results[:8]])
                _extract_prompt = "Here are search results. Extract ONLY factual, verifiable information that helps answer this question: '" + message + "'\n\nSearch results:\n" + _raw_results + "\n\nRules:\n- Extract ONLY dates, locations, names, events, numbers\n- 3-5 bullet points max\n- NO opinions, NO analysis, NO answering the question\n- If the results don't contain relevant facts, say 'No relevant facts found'\n- Format: '- Fact: ...'\n- Use original language (Chinese for Chinese facts, English for English facts)"
                _extracted = await minimax_client.chat(
                    [{"role": "user", "content": _extract_prompt}],
                    temperature=0.0, max_tokens=300
                )
                search_context = "\n### Verified facts from web (just retrieved):\n" + _extracted.strip()
                _log.info(f"[SEARCH_REFINE] {len(_all_results)} results -> {len(search_context)} chars")
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

    system_prompt = CHAT_SYSTEM_PROMPT.format(
            current_date=datetime.now().strftime("%Y-%m-%d"),
        name=info["name"],
        search_context=search_context + restricted_reminder,
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
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
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ── Blocking endpoints ────────────────────────────────────────

async def _handle_mode(request: ChatRequest, user_id: str, db: AsyncSession) -> ChatResponse:
    # Safety filter: check input
    safety = check_input(request.message)
    if not safety["safe"]:
        return ChatResponse(message=safety["message"], sources=["safety"], style_match=0.0)

    info = await _get_soul(request.persona_id, db)
    search_context = ""
    try:
        sr = await search_web([f"{info['name']} {request.message} 2026"])
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
                sc_parts = ["\n### Latest web search results (retrieved just now):"]
                for r in _all_results[:6]:
                    sc_parts.append(f"- **{r['title']}**: {r['snippet'][:200]}")
                search_context = "\n".join(sc_parts)
    except Exception:
        pass
    system_prompt = CHAT_SYSTEM_PROMPT.format(
        current_date=datetime.now().strftime("%Y-%m-%d"),
        name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
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
    if user.tier == "restricted":
        _rc = check_restricted_output(reply)
        if not _rc["safe"]:
            reply = _rc["message"]
    await _save_message(conv_id, user_id, request.persona_id, "assistant", reply, db)
    return ChatResponse(message=reply, sources=["L3"], style_match=0.85)

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    request.mode = "chat"
    return await _handle_mode(request, user.id, db)


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
