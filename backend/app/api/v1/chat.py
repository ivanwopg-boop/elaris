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
from app.core.prompts import CHAT_SYSTEM_PROMPT, WRITE_SYSTEM_PROMPT, ADVISE_SYSTEM_PROMPT
from app.core.auth_deps import require_auth, require_auth_optional
from app.core.auth import decode_token
from app.models.db_models import User
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
    msg = ConversationMessage(
        id=str(uuid.uuid4()),
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
async def chat_stream(persona_id: str, message: str, request: Request, db: AsyncSession = Depends(get_db)):
    # Allow guests to chat with preset personas only
    user_id = _get_user_from_request(request)
    if not user_id:
        # Guest: verify persona is a preset (user_id=NULL)
        from app.models.db_models import Persona
        pr = await db.execute(select(Persona).where(Persona.id == persona_id))
        persona = pr.scalars().first()
        if not persona or persona.user_id is not None:
            raise HTTPException(status_code=403, detail="Login required for this persona")
    info = await _get_soul(persona_id, db)
    # Real-time web search for current information
    search_context = ""
    try:
        sr = await search_web([message])  # always search (self-hosted, unlimited)
        if sr and sr[0].get("results"):
            sc_parts = ["\n## Web Search (Real-time " + datetime.now().strftime("%Y-%m-%d") + ")"]
            for r in sr[0]["results"][:4]:
                if r.get("snippet"):
                    sc_parts.append(f"- {r['title']}: {r['snippet'][:200]}")
            search_context = "\n".join(sc_parts)
    except Exception as e:
        pass  # Continue without search results

    system_prompt = CHAT_SYSTEM_PROMPT.format(
            current_date=datetime.now().strftime("%Y-%m-%d"),
        name=info["name"],
        search_context=search_context,
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
    )

    msgs = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]

    user_id = _get_user_from_request(request)
    conv_id = None
    if user_id:
        conv_id = await _get_or_create_conversation(user_id, persona_id, db)
        await _save_message(conv_id, user_id, persona_id, "user", message, db)

    async def event_gen():
        try:
            reply = await minimax_client.chat(msgs, temperature=0.4, max_tokens=10000)
            if conv_id and user_id:
                await _save_message(conv_id, user_id, persona_id, "assistant", reply, db)
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {})
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/write/{persona_id}/stream")
async def write_stream(persona_id: str, message: str, context: str = "", request: Request = None, db: AsyncSession = Depends(get_db)):
    # Allow guests to write with preset personas only
    user_id = _get_user_from_request(request) if request else None
    if not user_id:
        from app.models.db_models import Persona
        pr = await db.execute(select(Persona).where(Persona.id == persona_id))
        persona = pr.scalars().first()
        if not persona or persona.user_id is not None:
            raise HTTPException(status_code=403, detail="Login required for this persona")
    info = await _get_soul(persona_id, db)
    system_prompt = WRITE_SYSTEM_PROMPT.format(
        name=info["name"],
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        context=context or message,
    )

    user_id = _get_user_from_request(request) if request else None
    conv_id = None
    if user_id:
        conv_id = await _get_or_create_conversation(user_id, persona_id, db)
        await _save_message(conv_id, user_id, persona_id, "user", message, db)

    async def event_gen():
        try:
            reply = await minimax_client.chat(
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": message}],
                temperature=0.4, max_tokens=10000,
            )
            if conv_id and user_id:
                await _save_message(conv_id, user_id, persona_id, "assistant", reply, db)
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {})
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/advise/{persona_id}/stream")
async def advise_stream(persona_id: str, message: str, context: str = "", request: Request = None, db: AsyncSession = Depends(get_db)):
    # Allow guests to advise with preset personas only
    user_id = _get_user_from_request(request) if request else None
    if not user_id:
        from app.models.db_models import Persona
        pr = await db.execute(select(Persona).where(Persona.id == persona_id))
        persona = pr.scalars().first()
        if not persona or persona.user_id is not None:
            raise HTTPException(status_code=403, detail="Login required for this persona")
    info = await _get_soul(persona_id, db)
    system_prompt = ADVISE_SYSTEM_PROMPT.format(
        name=info["name"],
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        context=context or message,
    )

    user_id = _get_user_from_request(request) if request else None
    conv_id = None
    if user_id:
        conv_id = await _get_or_create_conversation(user_id, persona_id, db)
        await _save_message(conv_id, user_id, persona_id, "user", message, db)

    async def event_gen():
        try:
            reply = await minimax_client.chat(
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": message}],
                temperature=0.4, max_tokens=10000,
            )
            if conv_id and user_id:
                await _save_message(conv_id, user_id, persona_id, "assistant", reply, db)
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {})
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ── Blocking endpoints ────────────────────────────────────────

async def _handle_mode(request: ChatRequest, user_id: str, db: AsyncSession) -> ChatResponse:
    info = await _get_soul(request.persona_id, db)
    if request.mode == "chat":
        search_context = ""
        try:
            sr = await search_web([request.message])  # always search (self-hosted, unlimited)
            if sr and sr[0].get("results"):
                sc_parts = ["\n## Web Search (Real-time " + datetime.now().strftime("%Y-%m-%d") + ")"]
                for r in sr[0]["results"][:4]:
                    if r.get("snippet"):
                        sc_parts.append(f"- {r['title']}: {r['snippet'][:200]}")
                search_context = "\n".join(sc_parts)
        except Exception:
            pass
        system_prompt = CHAT_SYSTEM_PROMPT.format(
            current_date=datetime.now().strftime("%Y-%m-%d"),
            name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
            search_context=search_context,
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}]
    elif request.mode == "write":
        system_prompt = WRITE_SYSTEM_PROMPT.format(
            name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
            context=request.context or request.message,
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}]
    elif request.mode == "advise":
        system_prompt = ADVISE_SYSTEM_PROMPT.format(
            name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
            context=request.context or request.message,
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}]
    else:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {request.mode}")

    # Get or create conversation
    conv_id = await _get_or_create_conversation(user_id, request.persona_id, db)

    # Save user message
    await _save_message(conv_id, user_id, request.persona_id, "user", request.message, db)

    reply = await minimax_client.chat(messages, temperature=0.4, max_tokens=10000)

    # Save assistant message
    await _save_message(conv_id, user_id, request.persona_id, "assistant", reply, db)

    return ChatResponse(message=reply, sources=["L3"], style_match=0.85)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    request.mode = "chat"
    return await _handle_mode(request, user.id, db)

@router.post("/write", response_model=ChatResponse)
async def write(request: ChatRequest, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    request.mode = "write"
    return await _handle_mode(request, user.id, db)

@router.post("/advise", response_model=ChatResponse)
async def advise(request: ChatRequest, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    request.mode = "advise"
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
