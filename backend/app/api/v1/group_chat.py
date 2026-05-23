"""Group chat API routes — multi-persona conversation."""

import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.db_models import GroupChat, GroupChatMessage, Persona, User
from app.core.auth_deps import require_auth, require_premium
from app.models.schemas import (
    GroupChatCreate, GroupChatOut, GroupChatMessageOut,
    GroupChatDetail, GroupChatSendRequest, GroupChatInviteRequest,
)
from app.services.group_chat_service import create_chat, add_user_message, run_group_chat_stream

def _now():
    return datetime.now(timezone.utc)


router = APIRouter(prefix="/group-chat", tags=["Group Chat"])

# ── Per-chat processing lock ──
_chat_locks: set[str] = set()


async def _sse_event(event_name: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {payload}\n\n"


@router.post("", response_model=GroupChatOut, status_code=status.HTTP_201_CREATED)
async def create_group_chat(data: GroupChatCreate, user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    chat = await create_chat(data.title, data.persona_ids, data.persona_roles, db, user_id=user.id)
    return _chat_to_out(chat, 0)


@router.get("", response_model=list[GroupChatOut])
async def list_group_chats(user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GroupChat).where(GroupChat.user_id == user.id).order_by(GroupChat.created_at.desc()))
    chats = result.scalars().all()
    outs = []
    for c in chats:
        mc = await db.execute(select(func.count()).select_from(GroupChatMessage).where(GroupChatMessage.chat_id == c.id))
        outs.append(_chat_to_out(c, mc.scalar() or 0))
    return outs


@router.get("/{chat_id}", response_model=GroupChatDetail)
async def get_group_chat(chat_id: str, user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id, GroupChat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    mc = await db.execute(select(func.count()).select_from(GroupChatMessage).where(GroupChatMessage.chat_id == chat_id))
    msg_result = await db.execute(
        select(GroupChatMessage).where(GroupChatMessage.chat_id == chat_id).order_by(GroupChatMessage.created_at)
    )
    messages = msg_result.scalars().all()

    # Build persona name map for @ mentions
    from app.models.db_models import Persona as _Persona
    pids = json.loads(chat.persona_ids)
    pname_map: dict[str, str] = {}
    for pid in pids:
        pr = await db.execute(select(_Persona).where(_Persona.id == pid))
        pp = pr.scalar_one_or_none()
        if pp and pp.name:
            pname_map[pid] = pp.name

    return GroupChatDetail(
        chat=_chat_to_out(chat, mc.scalar() or 0, pname_map),
        messages=[GroupChatMessageOut(
            id=m.id, chat_id=m.chat_id, sender_type=m.sender_type,
            sender_id=m.sender_id, sender_name=m.sender_name,
            content=m.content, round_number=m.round_number, created_at=m.created_at,
        ) for m in messages],
    )


@router.post("/{chat_id}/send-blocking")
async def group_chat_send_blocking(
    chat_id: str,
    data: GroupChatSendRequest,
    db: AsyncSession = Depends(get_db),
):
    """Save user message + run all persona responses synchronously."""
    from app.services.group_chat_service import add_user_message, run_group_chat_stream

    # Check per-chat lock
    if chat_id in _chat_locks:
        return {"status": "busy", "message": "Previous round still in progress, please wait"}

    _chat_locks.add(chat_id)
    try:
        # Save user message
        await add_user_message(chat_id, data.message, db)

        # Run all persona responses — continue even if some fail
        has_error = False
        async for event in run_group_chat_stream(chat_id, data.message, db):
            ev_type = event.get("type")
            if ev_type in ("message",):
                await db.commit()
            elif ev_type == "error":
                has_error = True
                await db.commit()  # Still commit so far

        await db.commit()
        if has_error:
            return {"status": "partial", "message": "Some personas failed to respond"}
        return {"status": "completed"}
    finally:
        _chat_locks.discard(chat_id)


@router.get("/{chat_id}/sse")
async def group_chat_sse(chat_id: str, message: str, user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    # verify ownership
    """SSE endpoint: user sends a message → all personas respond streaming."""

    async def event_generator():
        async for event in run_group_chat_stream(chat_id, message, db):
            ev_type = event.pop("type", None)
            if ev_type == "thinking":
                yield await _sse_event("thinking", event)
            elif ev_type == "message":
                yield await _sse_event("message", event)
            elif ev_type == "done":
                yield await _sse_event("done", event)
            elif ev_type == "error":
                yield await _sse_event("error", event)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{chat_id}/invite")
async def group_chat_invite(
    chat_id: str,
    data: GroupChatInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Invite a persona to the group chat."""
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Load persona
    p_result = await db.execute(select(Persona).where(Persona.id == data.persona_id))
    persona = p_result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    # Check already in chat
    current_ids = json.loads(chat.persona_ids)
    if data.persona_id in current_ids:
        raise HTTPException(status_code=400, detail="Already in group chat")

    # Add to chat
    current_ids.append(data.persona_id)
    chat.persona_ids = json.dumps(current_ids)

    # Add system message
    msg = GroupChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        sender_type="system",
        sender_id=data.persona_id,
        sender_name=persona.name,
        content=f"{persona.name} joined the group chat",
        round_number=0,
        created_at=_now(),
    )
    db.add(msg)
    await db.commit()

    return {"ok": True, "persona_name": persona.name}


@router.delete("/{chat_id}/personas/{persona_id}")
async def remove_persona(
    chat_id: str,
    persona_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Remove a persona from the group chat."""
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    current_ids = json.loads(chat.persona_ids)
    if persona_id not in current_ids:
        raise HTTPException(status_code=400, detail="Persona not in group chat")

    # Get persona name before removing
    p_result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = p_result.scalar_one_or_none()
    persona_name = persona.name if persona else "This persona"

    # Remove from chat
    current_ids.remove(persona_id)
    chat.persona_ids = json.dumps(current_ids)

    # Add system message
    msg = GroupChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        sender_type="system",
        sender_id=persona_id,
        sender_name=persona_name,
        content=f"{persona_name} has been removed from the group",
        round_number=0,
        created_at=_now(),
    )
    db.add(msg)
    await db.commit()

    return {"ok": True, "persona_name": persona_name}


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group_chat(chat_id: str, user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id, GroupChat.user_id == user.id))
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.delete(chat)
    await db.flush()


def _chat_to_out(chat: GroupChat, msg_count: int = 0, pname_map: dict[str, str] | None = None) -> GroupChatOut:
    return GroupChatOut(
        id=chat.id, title=chat.title,
        persona_ids=json.loads(chat.persona_ids),
        persona_roles=json.loads(chat.persona_roles) if chat.persona_roles else {},
        persona_names=pname_map or {},
        status=chat.status, message_count=msg_count,
        created_at=chat.created_at, updated_at=chat.updated_at,
    )
