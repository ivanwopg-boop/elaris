"""Brainstorm service — sequential multi-persona discussion engine.

Each brainstorm session supports sequential topics:
- Start with one topic → discussion runs → auto-summarize
- Add another topic → continue discussion with historical context

Streaming version: `run_brainstorm_stream` is an async generator that yields events.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import (
    Persona, PersonaSoul, BrainstormSession, BrainstormMessage, BrainstormFile,
)
from app.core.minimax_client import minimax_client
from app.core.prompts import (
    BRAINSTORM_SYSTEM_PROMPT,
    BRAINSTORM_MESSAGE_PROMPT,
    BRAINSTORM_SUMMARY_PROMPT,
    BRAINSTORM_ROUND1_PROMPT,
)


def _now():
    return datetime.now(timezone.utc)


async def create_session(
    title: str, topics: list[dict], persona_ids: list[str],
    persona_roles: dict[str, str], max_rounds: int, db: AsyncSession,
    user_id: str | None = None,
) -> BrainstormSession:
    session = BrainstormSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        topics=json.dumps(topics, ensure_ascii=False),
        persona_ids=json.dumps(persona_ids),
        persona_roles=json.dumps(persona_roles, ensure_ascii=False),
        max_rounds=max_rounds,
        status="created",
    )
    db.add(session)
    await db.flush()
    return session


async def run_brainstorm_stream(
    session_id: str,
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """
    Run the autonomous brainstorm discussion on the current topic as a streaming
    async generator. Each `yield` emits one SSE-serializable event dict.

    Event types:
      - topic_set      { type, title }
      - round_start    { type, round }
      - thinking       { type, persona_name, round }
      - message        { type, persona_name, content, round }
      - round_end      { type, round }
      - summary        { type, text }
      - done           { type }
      - error          { type, message }
    """
    # Load session
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        yield {"type": "error", "message": "Session not found"}
        return

    topics = json.loads(session.topics)
    if not topics:
        yield {"type": "error", "message": "No topics in session. Add a topic first."}
        return

    # The current topic is the latest one
    current_topic = topics[-1]

    # Emit topic_set
    yield {
        "type": "topic_set",
        "title": current_topic["title"],
        "detail": current_topic.get("detail", ""),
    }

    # Check if there were previous discussions (for context carryover)
    prev_messages_result = await db.execute(
        select(BrainstormMessage)
        .where(BrainstormMessage.session_id == session_id)
        .order_by(BrainstormMessage.round_number, BrainstormMessage.created_at)
    )
    existing_messages = prev_messages_result.scalars().all()

    is_continuation = len(existing_messages) > 0

    # Mark as running
    session.status = "running"
    await db.flush()

    try:
        persona_ids = json.loads(session.persona_ids)
        persona_roles = json.loads(session.persona_roles) if session.persona_roles else {}

        # Load all personas with souls
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

        if len(personas) < 2:
            yield {"type": "error", "message": "Need at least 2 valid personas with souls"}
            return

        # Load brainstorm files as context (before building topic_text)
        file_result = await db.execute(
            select(BrainstormFile).where(BrainstormFile.session_id == session_id)
        )
        brainstorm_files = file_result.scalars().all()
        file_context = ""
        if brainstorm_files:
            file_parts = [f"--- {f.file_name} ---\n{f.parsed_content}" for f in brainstorm_files]
            fc = "\n\n".join(file_parts)
            file_context = f"\n\n## Reference Materials\nFor discussion reference:\n\n{fc}"

        # Build topic and context
        topic_text = f"Topic: {current_topic['title']}"
        if current_topic.get('detail'):
            topic_text += f"\nDetail: {current_topic['detail']}"
        topic_text += file_context

        # Build previous context for continuation
        prev_context = ""
        if is_continuation:
            prev_msgs = "\n".join(
                f"[Round {m.round_number}] {m.persona_name}: {m.content[:200]}..."
                for m in existing_messages[-10:]  # Last 10 messages for context
            )
            prev_context = f"\n\n## Previous Discussion\n{prev_msgs}"
            if session.summary:
                prev_context += f"\n\n## Previous Summary\n{session.summary[:500]}"

        all_new_messages = []

        # ── Sequential turn-based conversation ──
        # A speaks → sees nothing (opens the discussion)
        # B speaks → reads A's message first
        # A speaks again → reads B's message first
        # B speaks again → reads A's new message first
        # ... alternating turns
        max_turns = session.max_rounds  # total alternating turns (not per-person rounds)
        persona_count = len(personas)

        for turn in range(1, max_turns + 1):
            # Which persona speaks this turn (cyclic: A, B, A, B, ...)
            persona = personas[(turn - 1) % persona_count]
            current_round = (turn - 1) // persona_count + 1

            yield {"type": "turn_start", "turn": turn, "persona_name": persona["name"]}
            yield {"type": "thinking", "persona_name": persona["name"], "turn": turn}

            # Build context from ALL previous messages (entire conversation so far)
            context = _build_turn_context(
                topic_text=topic_text,
                prev_context=prev_context,
                all_messages=all_new_messages,
                turn=turn,
                max_turns=max_turns,
                persona=persona,
                is_continuation=is_continuation,
            )

            if turn == 1:
                # First persona opens the discussion
                if is_continuation:
                    user_prompt = (
                        f"Welcome to a new round of discussion! The current topic is:\n\n"
                        f"{topic_text}\n\n"
                        f"You've discussed other topics before. Here's the context:{prev_context}\n\n"
                        f"Please combine previous consensus with the new topic and share your opening thoughts."
                    )
                else:
                    user_prompt = BRAINSTORM_ROUND1_PROMPT.format(
                        persona_name=persona["name"],
                        role=persona["role"],
                        topics=topic_text,
                    )
            else:
                user_prompt = BRAINSTORM_MESSAGE_PROMPT.format(
                    persona_name=persona["name"],
                    role=persona["role"],
                    context=context,
                )

            system_prompt = BRAINSTORM_SYSTEM_PROMPT.format(
                persona_name=persona["name"],
                soul_json=json.dumps(persona["soul"], indent=2, ensure_ascii=False),
                role=persona["role"],
            )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
            reply_chunks = []
            async for chunk in minimax_client.chat_stream(messages, temperature=0.6, max_tokens=1024):
                reply_chunks.append(chunk)
                yield {
                    "type": "message_chunk",
                    "persona_name": persona["name"],
                    "persona_id": persona["id"],
                    "content": chunk,
                    "turn": turn,
                }
            reply = "".join(reply_chunks)

            msg = BrainstormMessage(
                id=str(uuid.uuid4()),
                session_id=session_id,
                round_number=current_round,
                persona_id=persona["id"],
                persona_name=persona["name"],
                content=reply,
                created_at=_now(),
            )
            db.add(msg)
            all_new_messages.append({
                "persona_name": persona["name"],
                "content": reply,
                "turn": turn,
                "round_number": current_round,
            })

            yield {
                "type": "message",
                "persona_name": persona["name"],
                "persona_id": persona["id"],
                "content": reply,
                "turn": turn,
            }

            session.completed_rounds = current_round
            await db.flush()
            await db.commit()  # Commit so other sessions can see progress

        # Generate summary for this topic
        all_new_text = "\n\n".join(
            f"[Round {m['round_number']}] {m['persona_name']}: {m['content']}"
            for m in all_new_messages
        )

        summary_prompt = BRAINSTORM_SUMMARY_PROMPT.format(
            title=f"{session.title} - {current_topic['title']}",
            topics=topic_text,
            discussion=all_new_text,
        )

        summary_messages = [
            {"role": "system", "content": "You are a professional meeting summary analyst."},
            {"role": "user", "content": summary_prompt},
        ]
        topic_summary = await minimax_client.chat(summary_messages, temperature=0.3, max_tokens=4096)

        # If previous summary exists, combine them
        if session.summary:
            combined = session.summary + "\n\n---\n\n" + topic_summary
            session.summary = combined
        else:
            session.summary = topic_summary

        session.status = "completed"
        await db.flush()

        yield {"type": "summary", "text": session.summary}
        yield {"type": "done"}

        await db.commit()

    except Exception as e:
        session.status = "failed"
        await db.flush()
        yield {"type": "error", "message": str(e)}


# ── Legacy blocking version (kept for backwards compatibility) ────────────────

async def run_brainstorm(session_id: str, db: AsyncSession) -> dict:
    """
    Run the autonomous brainstorm discussion on the current topic.
    Each call processes one topic (the latest one).
    """
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError("Session not found")

    topics = json.loads(session.topics)
    if not topics:
        raise ValueError("No topics in session. Add a topic first.")

    current_topic = topics[-1]

    prev_messages_result = await db.execute(
        select(BrainstormMessage)
        .where(BrainstormMessage.session_id == session_id)
        .order_by(BrainstormMessage.round_number, BrainstormMessage.created_at)
    )
    existing_messages = prev_messages_result.scalars().all()

    is_continuation = len(existing_messages) > 0

    session.status = "running"
    await db.flush()

    try:
        persona_ids = json.loads(session.persona_ids)
        persona_roles = json.loads(session.persona_roles) if session.persona_roles else {}

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

        if len(personas) < 2:
            raise ValueError("Need at least 2 valid personas with souls")

        topic_text = f"Topic: {current_topic['title']}"
        if current_topic.get('detail'):
            topic_text += f"\nDetail: {current_topic['detail']}"

        prev_context = ""
        if is_continuation:
            prev_msgs = "\n".join(
                f"[Round {m.round_number}] {m.persona_name}: {m.content[:200]}..."
                for m in existing_messages[-10:]
            )
            prev_context = f"\n\n## Previous Discussion\n{prev_msgs}"
            if session.summary:
                prev_context += f"\n\n## Previous Summary\n{session.summary[:500]}"

        all_new_messages = []

        for round_num in range(1, session.max_rounds + 1):
            round_messages = []
            for persona in personas:
                context = _build_context(
                    topic_text, prev_context,
                    all_new_messages, round_num,
                    session.max_rounds, persona,
                    is_continuation,
                )

                if round_num == 1:
                    if is_continuation:
                        user_prompt = (
                            f"Welcome to a new round of discussion! The current topic is:\n\n"
                            f"{topic_text}\n\n"
                            f"You've discussed other topics before. Here's the context:{prev_context}\n\n"
                            f"Please combine previous consensus with the new topic and share your opening thoughts."
                        )
                    else:
                        user_prompt = BRAINSTORM_ROUND1_PROMPT.format(
                            persona_name=persona["name"],
                            role=persona["role"],
                            topics=topic_text,
                        )
                else:
                    user_prompt = BRAINSTORM_MESSAGE_PROMPT.format(
                        persona_name=persona["name"],
                        role=persona["role"],
                        context=context,
                    )

                system_prompt = BRAINSTORM_SYSTEM_PROMPT.format(
                    persona_name=persona["name"],
                    soul_json=json.dumps(persona["soul"], indent=2, ensure_ascii=False),
                    role=persona["role"],
                )

                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
                reply = await minimax_client.chat(messages, temperature=0.6, max_tokens=1024)

                msg = BrainstormMessage(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    round_number=round_num,
                    persona_id=persona["id"],
                    persona_name=persona["name"],
                    content=reply,
                    created_at=_now(),
                )
                db.add(msg)
                round_messages.append({
                    "persona_name": persona["name"],
                    "content": reply,
                    "round_number": round_num,
                })

            all_new_messages.extend(round_messages)
            session.completed_rounds = round_num
            await db.flush()

        all_new_text = "\n\n".join(
            f"[Round {m['round_number']}] {m['persona_name']}: {m['content']}"
            for m in all_new_messages
        )

        summary_prompt = BRAINSTORM_SUMMARY_PROMPT.format(
            title=f"{session.title} - {current_topic['title']}",
            topics=topic_text,
            discussion=all_new_text,
        )

        summary_messages = [
            {"role": "system", "content": "You are a professional meeting summary analyst."},
            {"role": "user", "content": summary_prompt},
        ]
        topic_summary = await minimax_client.chat(summary_messages, temperature=0.3, max_tokens=4096)

        if session.summary:
            combined = session.summary + "\n\n---\n\n" + topic_summary
            session.summary = combined
        else:
            session.summary = topic_summary

        session.status = "completed"
        await db.flush()

        total_all = len(existing_messages) + len(all_new_messages)
        return {
            "session_id": session_id,
            "status": "completed",
            "topic": current_topic["title"],
            "new_rounds": session.completed_rounds,
            "total_messages": total_all,
            "summary": session.summary,
        }

    except Exception as e:
        session.status = "failed"
        await db.flush()
        raise


def _build_turn_context(
    topic_text: str,
    prev_context: str,
    all_messages: list[dict],
    turn: int,
    max_turns: int,
    persona: dict,
    is_continuation: bool,
) -> str:
    """Build context showing ALL previous messages sequentially."""
    lines = [
        f"## Discussion Topic\n{topic_text}",
        "",
    ]

    if prev_context:
        lines.append(f"## Historical Background\n{prev_context}\n")

    if all_messages:
        lines.append(f"## Existing ({len(all_messages)} messages)")
        for i, m in enumerate(all_messages, 1):
            lines.append(f"--- Speech #{i}: {m['persona_name']} ---")
            lines.append(m['content'])
            lines.append("")

    if turn == max_turns:
        lines.append("## ⚠️ Final round — please make a summary, distilling key consensus and disagreements")
    else:
        lines.append(f"## Your turn (turn {turn} of {max_turns})")

    lines.extend([
        "",
        f"## Your Info",
        f"- Name: {persona['name']}",
        f"- Role: {persona.get('role', 'Participant')}",
        "",
        "## Your Task",
        "Read everyone's previous statements, then:",
        "- Respond to the most relevant prior viewpoints",
        "- Offer new insights or additional information",
        "- If you agree with some viewpoints, support and expand on them",
        "- If you disagree, politely raise your doubts",
        "- Push the discussion forward",
        "",
        "Note: Your statement should reflect your personality. Quote your usual expressions. Don't simply repeat what others have said.",
    ])

    return "\n".join(lines)
