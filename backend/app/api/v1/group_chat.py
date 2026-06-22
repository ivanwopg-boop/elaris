from datetime import datetime, timezone
"""Group chat API routes — multi-persona conversation."""

import asyncio
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
_chat_locks: dict[str, datetime] = {}


async def _sse_event(event_name: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {payload}\n\n"


@router.post("", response_model=GroupChatOut, status_code=status.HTTP_201_CREATED)
async def create_group_chat(data: GroupChatCreate, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    chat = await create_chat(data.title, data.persona_ids, data.persona_roles, db, user_id=user.id)
    return await _chat_to_out(chat, 0, db)


@router.get("", response_model=list[GroupChatOut])
async def list_group_chats(user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GroupChat).where(GroupChat.user_id == user.id).order_by(GroupChat.created_at.desc()))
    chats = result.scalars().all()
    outs = []
    for c in chats:
        mc = await db.execute(select(func.count()).select_from(GroupChatMessage).where(GroupChatMessage.chat_id == c.id))
        outs.append(await _chat_to_out(c, mc.scalar() or 0, db))
    return outs


@router.get("/{chat_id}", response_model=GroupChatDetail)
async def get_group_chat(chat_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id, GroupChat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    mc = await db.execute(select(func.count()).select_from(GroupChatMessage).where(GroupChatMessage.chat_id == chat_id))
    msg_result = await db.execute(
        select(GroupChatMessage).where(GroupChatMessage.chat_id == chat_id).order_by(GroupChatMessage.created_at)
    )
    messages = msg_result.scalars().all()

    return GroupChatDetail(
        chat=await _chat_to_out(chat, mc.scalar() or 0, db),
        messages=[GroupChatMessageOut(
            id=m.id, chat_id=m.chat_id, sender_type=m.sender_type,
            sender_id=m.sender_id, sender_name=m.sender_name,
            content=m.content, round_number=m.round_number, created_at=m.created_at,
        ) for m in messages],
    )


@router.post("/{chat_id}/send")
async def group_chat_send_stream(
    chat_id: str,
    data: GroupChatSendRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Save user message + stream persona responses as SSE (one event per message).

    Each message is yielded as soon as the persona finishes — frontend gets a
    real-time "one by one" feed, no batched "all at once" reveal.
    """

    # Check per-chat lock
    if chat_id in _chat_locks:
        async def err_gen():
            yield await _sse_event("error", {"message": "Previous round still in progress, please wait"})
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    _chat_locks[chat_id] = datetime.now(timezone.utc)

    async def event_generator():
        try:
            await add_user_message(chat_id, data.message, db)
            await db.commit()

            async for event in run_group_chat_stream(chat_id, data.message, db):
                ev_type = event.get("type")
                if ev_type == "message":
                    try:
                        await db.commit()
                    except Exception:
                        pass
                yield await _sse_event(ev_type or "message", event)
        except Exception as e:
            try:
                await db.rollback()
            except Exception:
                pass
            yield await _sse_event("error", {"message": str(e)})
        finally:
            _chat_locks.pop(chat_id, None)

    return StreamingResponse(event_generator(), media_type="text/event-stream")



@router.get("/{chat_id}/sse")
async def group_chat_sse(chat_id: str, message: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
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


@router.get("/{chat_id}/listen")
async def group_chat_listen(
    chat_id: str,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Long-lived SSE: pushes new messages as they appear in this group chat.

    Client opens once on page mount, server streams 'message' events for any
    new row inserted into group_chat_messages. Replaces 1s polling.
    """
    # Verify ownership
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id, GroupChat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    last_id_seen = None
    last_ts_seen = None
    last_msg_q = await db.execute(
        select(GroupChatMessage.id, GroupChatMessage.created_at).where(GroupChatMessage.chat_id == chat_id)
        .order_by(GroupChatMessage.created_at.desc()).limit(1)
    )
    last_row = last_msg_q.first()
    if last_row:
        last_id_seen = last_row[0]
        last_ts_seen = last_row[1]

    async def event_generator():
        nonlocal last_id_seen, last_ts_seen
        # Yield ready first so client knows connection is live
        try:
            yield await _sse_event("ready", {"last_id": last_id_seen})
        except Exception:
            return
        # Capture current max so we don't replay history on (re)connect
        try:
            cur = await db.execute(
                select(GroupChatMessage.id, GroupChatMessage.created_at).where(GroupChatMessage.chat_id == chat_id)
                .order_by(GroupChatMessage.created_at.desc()).limit(1)
            )
            cur_row = cur.first()
            if cur_row:
                last_id_seen = cur_row[0]
                last_ts_seen = cur_row[1]
        except Exception:
            pass
        last_ping = asyncio.get_event_loop().time()
        while True:
            try:
                # Query by created_at (UUIDs aren't time-ordered, can't use id >)
                if last_ts_seen is None:
                    q = await db.execute(
                        select(GroupChatMessage).where(GroupChatMessage.chat_id == chat_id)
                        .order_by(GroupChatMessage.created_at.asc())
                    )
                else:
                    q = await db.execute(
                        select(GroupChatMessage).where(
                            GroupChatMessage.chat_id == chat_id,
                            GroupChatMessage.created_at > last_ts_seen
                        ).order_by(GroupChatMessage.created_at.asc())
                    )
                new_msgs = q.scalars().all()
                for m in new_msgs:
                    last_id_seen = m.id
                    last_ts_seen = m.created_at
                    yield await _sse_event("message", {
                        "id": m.id,
                        "chat_id": m.chat_id,
                        "sender_type": m.sender_type,
                        "sender_id": m.sender_id,
                        "sender_name": m.sender_name,
                        "content": m.content,
                        "created_at": m.created_at.isoformat() if m.created_at else None,
                    })
                now = asyncio.get_event_loop().time()
                if now - last_ping > 25:
                    yield ": keepalive\n\n"
                    last_ping = now
                await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                import logging
                logging.getLogger("sse").error(f"listener loop error: {type(e).__name__}: {e}")
                break

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
async def delete_group_chat(chat_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id, GroupChat.user_id == user.id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.delete(chat)
    await db.flush()


async def _chat_to_out(chat: GroupChat, msg_count: int = 0, db: AsyncSession = None) -> GroupChatOut:
    from sqlalchemy import select
    pids = json.loads(chat.persona_ids)
    names = {}
    if db:
        for pid in pids:
            try:
                stmt = select(Persona.name).where(Persona.id == pid)
                row = (await db.execute(stmt)).scalar_one_or_none()
                if row:
                    names[pid] = row
            except Exception:
                pass
    return GroupChatOut(
        id=chat.id, title=chat.title,
        persona_ids=pids,
        persona_names=names,
        persona_roles=json.loads(chat.persona_roles) if chat.persona_roles else {},
        status=chat.status, message_count=msg_count,
        created_at=chat.created_at, updated_at=chat.updated_at,
    )
