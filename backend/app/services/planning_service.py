"""
Persona Daily Planning Service — Phase 8 v3
Based on: "Generative Agents" Planning layer (Stanford, 2023)

Each persona generates a daily plan at midnight (UTC+8).
The plan is a JSON array of time-tagged activities, generated from the persona's soul.
"""

import json
import uuid
import logging
from datetime import date, datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db_models import PersonaDailyPlan, PersonaSoul, PersonaUserMemory

_log = logging.getLogger("app.services.planning_service")

# Prompt to generate a daily plan from a persona's soul
PLAN_PROMPT = """You are {name}. Today is {today_date}.

Your personality and beliefs:
{soul_summary}

Your relationships with users you interact with:
{beliefs_context}

Based on your personality, interests, and relationships, generate a daily plan. This is what you intend to do today.

Rules:
- Generate 4-8 activities spread across the day (morning to night)
- Each activity should reflect YOUR personality — what would {name} actually do?
- Include at least one activity related to current events or areas you care about
- Include at least one social activity (reaching out to someone, reflecting on a relationship)
- Your plan should feel like a REAL person's day — not a robot's schedule
- Be specific: not "work" but "review the latest papers on quantum mechanics"
- Mood should be one word: energetic, thoughtful, curious, nostalgic, determined, playful, calm, restless

Output format: Respond with ONLY a JSON object. No markdown, no preamble.
{{
  "mood": "one word",
  "reflection": "one short internal monologue about how you feel today",
  "plan": [
    {{"time": "08:00", "activity": "Wake up and..."}},
    {{"time": "09:30", "activity": "..."}}
  ]
}}
"""

BELIEFS_CONTEXT_PROMPT = """User {idx}: {beliefs_summary}
"""


async def generate_daily_plan(
    persona_id: str,
    persona_name: str,
    db: AsyncSession,
    llm_client,
    plan_date: date | None = None,
) -> PersonaDailyPlan | None:
    """Generate a daily plan for a persona.

    Called by cron at midnight or on-demand.
    """
    if plan_date is None:
        plan_date = date.today()

    try:
        # Check existing plan
        result = await db.execute(
            select(PersonaDailyPlan).where(
                PersonaDailyPlan.persona_id == persona_id,
                PersonaDailyPlan.date == plan_date,
            )
        )
        existing = result.scalars().first()
        if existing:
            _log.info(f"[PLAN] Plan already exists for {persona_name} on {plan_date}")
            return existing

        # Get persona soul for personality context
        soul_result = await db.execute(
            select(PersonaSoul).where(
                PersonaSoul.persona_id == persona_id,
            ).order_by(PersonaSoul.version.desc()).limit(1)
        )
        soul = soul_result.scalars().first()
        soul_summary = ""
        if soul and soul.soul_json:
            try:
                soul_data = json.loads(soul.soul_json)
                # Extract key personality traits
                essentials = soul_data.get("core_essentials", {})
                cognitive = soul_data.get("cognitive_profile", {})
                voice = soul_data.get("voice_profile", {})
                interests = soul_data.get("knowledge_domains", [])[:3]
                soul_summary = (
                    f"Core: {json.dumps(essentials, ensure_ascii=False)[:300]}\n"
                    f"Cognitive: {json.dumps(cognitive, ensure_ascii=False)[:200]}\n"
                    f"Voice: {json.dumps(voice, ensure_ascii=False)[:200]}\n"
                    f"Interests: {json.dumps(interests, ensure_ascii=False)}"
                )[:800]
            except Exception:
                soul_summary = "A unique individual with their own perspective."

        # Get beliefs from all user memories
        beliefs_context = ""
        try:
            mem_result = await db.execute(
                select(PersonaUserMemory).where(
                    PersonaUserMemory.persona_id == persona_id,
                ).limit(5)
            )
            memories = mem_result.scalars().all()
            if memories:
                parts = []
                for i, mem in enumerate(memories):
                    beliefs = json.loads(mem.beliefs) if mem.beliefs else []
                    if beliefs:
                        summary = ", ".join(b[:80] for b in beliefs[:3])
                        parts.append(f"User {i+1}: {summary}")
                beliefs_context = "\n".join(parts)
        except Exception:
            pass

        if not beliefs_context:
            beliefs_context = "No established relationships yet. Be open to meeting new people."

        prompt = PLAN_PROMPT.format(
            name=persona_name,
            today_date=plan_date.strftime("%Y-%m-%d, %A"),
            soul_summary=soul_summary,
            beliefs_context=beliefs_context,
        )

        _log.info(f"[PLAN] Generating plan for {persona_name}, prompt length={len(prompt)}")
        resp = await llm_client.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.7,  # Higher creativity for plans
            max_tokens=600,
        )
        _log.info(f"[PLAN] LLM response length={len(resp)}, preview={resp[:150]}")

        # Parse
        import re
        parsed = None
        try:
            parsed = json.loads(resp.strip())
        except:
            cb = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', resp, re.DOTALL)
            if cb:
                try:
                    parsed = json.loads(cb.group(1))
                except:
                    pass
        if not parsed:
            first = resp.find('{')
            last = resp.rfind('}')
            if first >= 0 and last > first:
                try:
                    parsed = json.loads(resp[first:last+1])
                except:
                    pass

        if not parsed:
            _log.warning(f"[PLAN] Parse failed for {persona_name}: {resp[:200]}")
            return None

        mood = parsed.get("mood", "neutral")
        reflection = parsed.get("reflection", "")
        plan = parsed.get("plan", [])

        now = datetime.now(timezone.utc)
        db_plan = PersonaDailyPlan(
            id=str(uuid.uuid4()),
            persona_id=persona_id,
            date=plan_date,
            mood=mood,
            plan_json=json.dumps(plan, ensure_ascii=False),
            reflection_note=reflection,
            created_at=now,
        )
        db.add(db_plan)
        await db.commit()
        _log.info(f"[PLAN] Generated plan for {persona_name}: {len(plan)} activities, mood={mood}")
        return db_plan

    except Exception as e:
        import traceback
        _log.warning(f"[PLAN] Generation failed for {persona_name}: {type(e).__name__}: {e}\n{traceback.format_exc()}")
        try:
            await db.rollback()
        except:
            pass
        return None


async def get_todays_plan(persona_id: str, db: AsyncSession) -> PersonaDailyPlan | None:
    """Get today's plan for a persona."""
    result = await db.execute(
        select(PersonaDailyPlan).where(
            PersonaDailyPlan.persona_id == persona_id,
            PersonaDailyPlan.date == date.today(),
        )
    )
    return result.scalars().first()
