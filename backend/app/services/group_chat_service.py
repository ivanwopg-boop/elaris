"""Group chat service — multi-persona conversation with SSE streaming."""

import json
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import Persona, PersonaSoul, GroupChat, GroupChatMessage
from app.core.minimax_client import minimax_client
from app.core.group_chat_prompts import (
    GROUP_CHAT_SYSTEM_PROMPT,
    GROUP_CHAT_USER_PROMPT,
    GROUP_CHAT_FIRST_PROMPT,
)


def _now():
    return datetime.now(timezone.utc)


async def create_chat(
    title: str, persona_ids: list[str],
    persona_roles: dict[str, str], db: AsyncSession,
    user_id: str | None = None,
) -> GroupChat:
    chat = GroupChat(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        persona_ids=json.dumps(persona_ids),
        persona_roles=json.dumps(persona_roles, ensure_ascii=False),
    )
    db.add(chat)
    await db.flush()
    return chat


async def add_user_message(chat_id: str, message: str, db: AsyncSession) -> GroupChatMessage:
    msg = GroupChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        sender_type="user",
        sender_id="user",
        sender_name="Me",
        content=message,
        round_number=0,
        created_at=_now(),
    )
    db.add(msg)
    await db.flush()
    return msg


async def run_group_chat_stream(
    chat_id: str, user_message: str, db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Generate persona responses as SSE events."""
    # Load chat
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        yield {"type": "error", "message": "Group chat not found"}
        return

    persona_ids = json.loads(chat.persona_ids)
    persona_roles = json.loads(chat.persona_roles) if chat.persona_roles else {}

    # Load all existing messages for context
    msg_result = await db.execute(
        select(GroupChatMessage)
        .where(GroupChatMessage.chat_id == chat_id)
        .order_by(GroupChatMessage.created_at)
    )
    all_messages = msg_result.scalars().all()

    # Load personas with souls
    personas = []
    for pid in persona_ids:
        pr = await db.execute(select(Persona).where(Persona.id == pid))
        p = pr.scalar_one_or_none()
        if not p:
            continue
        sr = await db.execute(
            select(PersonaSoul)
            .where(PersonaSoul.persona_id == pid)
            .order_by(PersonaSoul.version.desc())
        )
        soul = sr.scalars().first()
        personas.append({
            "id": pid,
            "name": p.name,
            "soul": json.loads(soul.soul_json) if soul else {},
            "has_soul": soul is not None,
            "role": persona_roles.get(pid, ""),
        })

    if not personas:
        yield {"type": "error", "message": "No valid personas found"}
        return

    # Check for @mentions in user message
    import re
    mentioned = set()
    user_msg_text = user_message
    for p in personas:
        pattern = rf'@{re.escape(p["name"])}\b'
        if re.search(pattern, user_message):
            mentioned.add(p["id"])
            # Remove @name from message text sent to AI
            user_msg_text = re.sub(pattern, p["name"], user_msg_text)

    # Filter personas: only mentioned ones respond, or all if no mentions
    if mentioned:
        active_personas = [p for p in personas if p["id"] in mentioned]
        yield {"type": "info", "message": f"@ed {len(active_personas)} people"}
    else:
        active_personas = personas

    # Determine round number
    max_round = max((m.round_number for m in all_messages), default=0)
    round_num = max_round + 1

    # Build full conversation history from all previous messages
    full_history = ""
    prev_msgs = [m for m in all_messages if m.sender_type != "user" or m.content != user_message]
    if prev_msgs:
        parts = []
        for m in prev_msgs:
            role = "User" if m.sender_type == "user" else m.sender_name
            parts.append(f"[{role}]: {m.content}")
        full_history = "\n\n".join(parts)

    user_msg_text = user_message

    import asyncio

    async def _call_one(persona: dict) -> dict:
        try:
            if full_history:
                up = GROUP_CHAT_USER_PROMPT.format(
                    chat_title=chat.title,
                    user_message=user_msg_text,
                    context=f"## Previous Chat History\n{full_history}")
            else:
                up = GROUP_CHAT_FIRST_PROMPT.format(
                    chat_title=chat.title, user_message=user_msg_text)
            sp = GROUP_CHAT_SYSTEM_PROMPT.format(
                persona_name=persona["name"],
                soul_json=json.dumps(persona["soul"], indent=2, ensure_ascii=False),
                role=persona["role"])
            reply = await asyncio.wait_for(
                minimax_client.chat(
                    [{"role": "system", "content": sp}, {"role": "user", "content": up}],
                    temperature=0.5, max_tokens=10000),
                timeout=45)
            return {"persona_name": persona["name"], "persona_id": persona["id"], "content": reply}
        except asyncio.TimeoutError:
            return {"persona_name": persona["name"], "error": "Timed out after 45s"}
        except Exception as e:
            return {"persona_name": persona["name"], "error": str(e)}

    for persona in active_personas:
        yield {"type": "thinking", "persona_name": persona["name"]}

    tasks = [_call_one(p) for p in active_personas]
    for coro in asyncio.as_completed(tasks):
        result = await coro
        if "error" in result:
            yield {"type": "error", "persona_name": result["persona_name"], "message": result["error"]}
            continue
        msg = GroupChatMessage(
            id=str(uuid.uuid4()), chat_id=chat_id, sender_type="persona",
            sender_id=result["persona_id"], sender_name=result["persona_name"],
            content=result["content"], round_number=round_num, created_at=_now())
        db.add(msg)
        await db.commit()  # Commit so polling can see it
        yield {"type": "message", "persona_name": result["persona_name"],
               "persona_id": result["persona_id"], "content": result["content"]}


    await db.flush()
    yield {"type": "done"}
