"""
Persona User Memory Service
Handles conversation summaries and long-term memory injection.
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db_models import PersonaUserMemory, ConversationMessage

_log = logging.getLogger("app.services.memory_service")

SUMMARY_PROMPT = """You are a conversation summarizer. Below is a conversation between a user and an AI persona.

Summarize this conversation in 2-3 sentences. Also extract 1-5 key facts about the USER (their name, interests, preferences, goals, or anything notable).

If there is a previous summary, integrate the new information with it.

Output STRICT JSON:
{{"summary": "2-3 sentence summary", "facts": ["fact1", "fact2", ...]}}

Previous summary: {prev_summary}
Previous facts: {prev_facts}

Conversation:
{conversation}
"""


async def generate_memory_summary(
    persona_id: str,
    user_id: str,
    conversation_text: str,
    db: AsyncSession,
    llm_client,
) -> None:
    """Generate or update conversation summary after a chat exchange."""
    try:
        # Get existing memory
        result = await db.execute(
            select(PersonaUserMemory).where(
                PersonaUserMemory.persona_id == persona_id,
                PersonaUserMemory.user_id == user_id,
            )
        )
        mem = result.scalars().first()

        prev_summary = mem.summary if mem and mem.summary else "None"
        prev_facts = json.dumps(json.loads(mem.key_facts) if mem and mem.key_facts else [], ensure_ascii=False)

        prompt = SUMMARY_PROMPT.format(
            prev_summary=prev_summary,
            prev_facts=prev_facts,
            conversation=conversation_text[:3000],  # cap at 3k chars
        )

        _log.info(f"[MEMORY] Generating summary, prompt length={len(prompt)}")
        resp = await llm_client.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=400,
        )
        _log.info(f"[MEMORY] LLM response length={len(resp)}, preview={resp[:100]}")

        # Parse JSON response - robust extraction
        import re
        parsed = None
        # Try 1: direct JSON parse
        try:
            parsed = json.loads(resp.strip())
        except:
            pass
        # Try 2: extract JSON from markdown code block
        if not parsed:
            cb = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', resp, re.DOTALL)
            if cb:
                try:
                    parsed = json.loads(cb.group(1))
                except:
                    pass
        # Try 3: find first { ... last } and parse
        if not parsed:
            first = resp.find('{')
            last = resp.rfind('}')
            if first >= 0 and last > first:
                try:
                    parsed = json.loads(resp[first:last+1])
                except:
                    pass
        if not parsed or 'summary' not in parsed:
            _log.warning(f"Memory summary parse failed, raw: {resp[:300]}")
            return

        summary = parsed.get("summary", "")
        facts = parsed.get("facts", [])
        if isinstance(facts, str):
            facts = [facts]

        # Merge with previous facts (dedupe, cap at 15)
        if mem and mem.key_facts:
            old_facts = json.loads(mem.key_facts)
            seen = set(f.lower().strip() for f in old_facts)
            for f in facts:
                if f.lower().strip() not in seen:
                    old_facts.append(f)
                    seen.add(f.lower().strip())
            facts = old_facts[:15]

        now = datetime.now(timezone.utc)

        if mem:
            mem.summary = summary
            mem.key_facts = json.dumps(facts, ensure_ascii=False)
            mem.message_count = (mem.message_count or 0) + 1
            mem.last_interacted = now
            mem.updated_at = now
        else:
            mem = PersonaUserMemory(
                id=str(uuid.uuid4()),
                persona_id=persona_id,
                user_id=user_id,
                summary=summary,
                key_facts=json.dumps(facts, ensure_ascii=False),
                message_count=1,
                last_interacted=now,
                created_at=now,
                updated_at=now,
            )
            db.add(mem)

        await db.commit()
        _log.info(f"[MEMORY] Updated for persona={persona_id[:8]}... user={user_id[:8]}... facts={len(facts)}")

    except Exception as e:
        import traceback
        _log.warning(f"[MEMORY] Summary generation failed: {type(e).__name__}: {e}\n{traceback.format_exc()}")
        try:
            await db.rollback()
        except:
            pass


async def get_memory_context(persona_id: str, user_id: str, db: AsyncSession) -> str:
    """Get formatted memory string to inject into system prompt."""
    try:
        result = await db.execute(
            select(PersonaUserMemory).where(
                PersonaUserMemory.persona_id == persona_id,
                PersonaUserMemory.user_id == user_id,
            )
        )
        mem = result.scalars().first()
        if not mem or not mem.summary:
            return ""

        facts = json.loads(mem.key_facts) if mem.key_facts else []
        facts_str = "; ".join(facts) if facts else ""

        parts = [f"You have talked with this user {mem.message_count} times before."]
        if mem.summary:
            parts.append(f"What you remember: {mem.summary}")
        if facts_str:
            parts.append(f"Key facts about them: {facts_str}")
        parts.append("Reference these naturally — don't list them mechanically, weave them into conversation.")

        return "\n\nYOUR RELATIONSHIP WITH THIS USER:\n" + "\n".join(parts)
    except Exception as e:
        _log.warning(f"[MEMORY] Context retrieval failed: {e}")
        return ""
