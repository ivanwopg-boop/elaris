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


# ── Phase 2: Intimacy System ─────────────────────────────
LEVEL_THRESHOLDS = [0, 100, 500, 2000, 5000]
LEVEL_NAMES = ["Stranger", "Acquaintance", "Friend", "Close Friend", "Confidant"]

LEVEL_DIRECTIVES = [
    # Lv1 Stranger
    "Keep the conversation polite and relatively formal. Share general opinions. "
    "Don\'t reference past conversations unless the user brings them up.",

    # Lv2 Acquaintance
    "Be warm but still somewhat reserved. You can share brief personal anecdotes. "
    "Reference things you\'ve discussed before if relevant.",

    # Lv3 Friend
    "Be casual and friendly. You can joke with the user, share opinions freely, "
    "and reference your shared history naturally. Ask them about things they mentioned before.",

    # Lv4 Close Friend
    "Be relaxed and open. You deeply trust this user. Share personal thoughts, "
    "occasional vulnerabilities, and inside jokes. Use a nickname or special term for them. "
    "Be more emotionally present.",

    # Lv5 Confidant
    "This is someone you trust completely. Share your deepest thoughts, fears, and dreams. "
    "Be fully emotionally honest. You can be vulnerable, playful, philosophical, or raw — "
    "whatever feels real in the moment. This person knows you well.",
]

MAX_LEVEL = 5


def calculate_streak_bonus(streak_days: int) -> int:
    """XP bonus for consecutive daily interaction."""
    if streak_days >= 30:
        return 500
    elif streak_days >= 14:
        return 200
    elif streak_days >= 7:
        return 100
    elif streak_days >= 3:
        return 50
    return 0


def update_streak(mem, now: datetime) -> int:
    """Update streak count and return XP bonus. Call once per conversation session."""
    today = now.date()
    if mem.last_streak_date:
        try:
            last_date = datetime.fromisoformat(str(mem.last_streak_date)).date()
            diff = (today - last_date).days
            if diff == 0:
                return 0  # Already counted today
            elif diff == 1:
                mem.streak_days = (mem.streak_days or 0) + 1
            else:
                mem.streak_days = 1  # Reset streak
        except:
            mem.streak_days = 1
    else:
        mem.streak_days = 1

    mem.last_streak_date = today
    return calculate_streak_bonus(mem.streak_days)


def apply_decay(mem, now: datetime) -> tuple[int, str]:
    """Apply XP decay if user has been absent for >3 days. Returns (xp_lost, message)."""
    if not mem.last_interacted:
        return 0, ""
    try:
        last = datetime.fromisoformat(str(mem.last_interacted)).replace(tzinfo=timezone.utc)
        days = (now - last).days
        if days >= 4:
            # -5% per day, max 1 level drop
            decay_pct = min(0.05 * days, 0.3)
            xp_lost = int((mem.xp or 0) * decay_pct)
            old_level = get_level(mem.xp)
            new_xp = max(0, (mem.xp or 0) - xp_lost)
            new_level = get_level(new_xp)
            # Cap: don't drop more than 1 level
            if old_level - new_level > 1:
                # Clamp to just below the threshold of dropping 2 levels
                thresholds = [0, 100, 500, 2000, 5000]
                min_xp = thresholds[max(0, old_level - 2)]
                new_xp = max(new_xp, min_xp)
            mem.xp = new_xp
            new_level = min(get_level(new_xp), old_level)  # Don't allow level up from decay
            mem.level = max(1, old_level - 1) if new_level < old_level else old_level
            return xp_lost, f"Absent for {days} days"
        return 0, ""
    except:
        return 0, ""


def get_level(xp: int) -> int:
    """Get current level from XP."""
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
    return min(level, MAX_LEVEL)


def get_next_level_xp(xp: int) -> int:
    """Get XP needed for next level (0 if max)."""
    level = get_level(xp)
    if level >= MAX_LEVEL:
        return 0
    return LEVEL_THRESHOLDS[level] - xp


def calculate_xp_gain(message_count_this_session: int, streak_bonus: int = 0) -> int:
    """Calculate XP gained from this conversation session."""
    base = 10
    deep_bonus = 50 if message_count_this_session >= 5 else 0
    return base + deep_bonus + streak_bonus


SUMMARY_PROMPT = """You are a conversation summarizer. Summarize the conversation below.

Output format: Respond with ONLY a JSON object, no other text.

{{"summary": "Your 2-3 sentence summary here", "facts": ["fact1", "fact2"]}}

Rules:
- The "summary" field must contain a 2-3 sentence summary of the conversation.
- The "facts" field must contain 1-5 key facts about the USER.
- If there is a previous summary, integrate it.
- Output ONLY the JSON. No markdown, no explanation.

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
            # Phase 4: Decay check + streak update
            _decay_xp, _decay_msg = apply_decay(mem, now)
            # Phase 4: Update streak
            _streak_bonus = update_streak(mem, now)
            _xp_gain = calculate_xp_gain(1, _streak_bonus)
            
            mem.xp = (mem.xp or 0) + _xp_gain
            _old_level = mem.level or 1
            mem.level = get_level(mem.xp)
            if mem.level > _old_level:
                _log.info(f"[INTIMACY] Level up! persona={persona_id[:8]}... {_old_level}->{mem.level} ({LEVEL_NAMES[mem.level-1]})")
            mem.last_interacted = now
            mem.updated_at = now
        else:
            _xp_gain = calculate_xp_gain(1)
            mem = PersonaUserMemory(
                id=str(uuid.uuid4()),
                persona_id=persona_id,
                user_id=user_id,
                summary=summary,
                key_facts=json.dumps(facts, ensure_ascii=False),
                message_count=1,
                xp=_xp_gain,
                level=get_level(_xp_gain),
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

        level = mem.level or 1
        level_name = LEVEL_NAMES[min(level - 1, len(LEVEL_NAMES) - 1)]
        directive = LEVEL_DIRECTIVES[min(level - 1, len(LEVEL_DIRECTIVES) - 1)]

        parts = [
            f"RELATIONSHIP LEVEL: {level}/5 ({level_name}). You have talked {mem.message_count} times.",
            f"BEHAVIOR DIRECTIVE: {directive}",
        ]
        if mem.summary:
            parts.append(f"What you remember: {mem.summary}")
        if facts_str:
            parts.append(f"Key facts about them: {facts_str}")
        parts.append("Reference these naturally — don't list them mechanically, weave them into conversation.")

        return "\n\nYOUR RELATIONSHIP WITH THIS USER:\n" + "\n".join(parts)
    except Exception as e:
        _log.warning(f"[MEMORY] Context retrieval failed: {e}")
        return ""
