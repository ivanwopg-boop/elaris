"""Momentum service: generate watch topics for personas, expire old moments, etc."""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.models.db_models import (
    Persona, PersonaWatchTopic, PersonaMoment, PersonaSoul,
)
from app.core.minimax_client import minimax_client


WATCH_TOPIC_GEN_PROMPT = """You are helping an AI persona platform pick news-search keywords that this persona would naturally follow.

Persona name: {persona_name}
Persona description: {description}
Persona soul summary (v3 narrative cards):
{soul_summary}

Based on this persona's life, work, and interests, suggest 3-5 search keywords that would find REAL news headlines this persona would comment on.

CRITICAL — use NEWS-HEADLINE words, not academic jargon:
  ✅ "AI regulation"          ❌ "machine learning policy frameworks"
  ✅ "stock market"           ❌ "equity market dynamics"
  ✅ "movie box office"       ❌ "cinematic revenue analysis"
  ✅ "climate change"         ❌ "anthropogenic modification"
  ✅ "smartphone release"     ❌ "mobile device lifecycle"

Rules:
- Each keyword 2-5 words
- MUST include 1-2 BROAD catch-all keywords (e.g. "AI technology", "stock market", "China economy")
- MUST include 1-2 SPECIFIC keywords about their known interests
- Topics should generate OPINIONS, not just facts
- Output as JSON: {{"topics": ["keyword1", "keyword2", ...]}}
- 3-5 topics total
- Write keywords in {lang}: for English use English keywords, for Chinese use Chinese keywords.

Example for Steve Jobs:
{{"topics": ["Apple new product", "tech industry trends", "iPhone sales", "Silicon Valley startups", "design innovation"]}}

Example for Einstein:
{{"topics": ["physics breakthrough", "nuclear weapons", "science funding", "quantum computing", "Nobel Prize 2026"]}}

Example for a Chinese celebrity:
{{"topics": ["演唱会票房", "华语乐坛动态", "新专辑发布", "综艺节目", "流行音乐趋势"]}}
"""


async def generate_watch_topics(
    persona: Persona,
    soul_summary: str,
    lang: str = "en",
) -> list[str]:
    """Call LLM to suggest 3-5 watch topics based on persona's soul."""
    if not persona.name:
        return []
    try:
        prompt = WATCH_TOPIC_GEN_PROMPT.format(
            persona_name=persona.name,
            description=persona.description or persona.name,
            soul_summary=soul_summary[:1500],  # truncate for token cost
        )
        text = await minimax_client.chat(
            [
                {"role": "system", "content": "You output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=400,
        )
        # Extract JSON
        text = (text or "").strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
        topics = data.get("topics", [])
        # Sanitize
        out = []
        for t in topics:
            t = str(t).strip()
            if 2 <= len(t) <= 100 and t not in out:
                out.append(t)
        return out[:5]
    except Exception as e:
        print(f"[momentum] generate_watch_topics failed for {persona.name}: {e}", flush=True)
        return []


async def auto_populate_watch_topics(
    persona: Persona,
    db: AsyncSession,
    lang: str = "en",
) -> list[PersonaWatchTopic]:
    """Called after a successful distillation. Generates + persists watch topics.

    Idempotent: if watch topics already exist for this persona (in `lang`), skip.
    """
    # Check if already populated
    existing = await db.execute(
        select(func.count(PersonaWatchTopic.id)).where(
            and_(
                PersonaWatchTopic.persona_id == persona.id,
                PersonaWatchTopic.source_lang == lang,
            )
        )
    )
    if (existing.scalar() or 0) > 0:
        return []

    # Get the soul summary
    soul_res = await db.execute(
        select(PersonaSoul)
        .where(and_(PersonaSoul.persona_id == persona.id, PersonaSoul.lang == lang))
        .order_by(PersonaSoul.version.desc())
        .limit(1)
    )
    soul_row = soul_res.scalar_one_or_none()
    if not soul_row:
        return []
    try:
        soul_data = json.loads(soul_row.soul_json)
    except Exception:
        return []
    # Extract a summary from v3 cards or v2 fields
    soul_summary = _extract_soul_summary(soul_data)

    topics = await generate_watch_topics(persona, soul_summary, lang=lang)
    if not topics:
        return []

    rows = []
    for t in topics:
        r = PersonaWatchTopic(
            id=str(uuid.uuid4()),
            persona_id=persona.id,
            topic=t,
            source_lang=lang,
            is_auto_generated=True,
            is_active=True,
        )
        db.add(r)
        rows.append(r)
    await db.commit()
    print(f"[momentum] auto-populated {len(rows)} watch topics for {persona.name} ({lang})", flush=True)
    return rows


def _extract_soul_summary(soul_data: dict) -> str:
    """Pull a ~1000-char summary from a v2/v3 soul dict."""
    parts = []
    # v3: 5-7 narrative insight cards
    if "narrative_insight_cards" in soul_data:
        for card in soul_data["narrative_insight_cards"][:5]:
            if isinstance(card, dict):
                t = card.get("title") or card.get("card_title") or ""
                b = card.get("body") or card.get("text") or card.get("content") or ""
                if t:
                    parts.append(f"## {t}\n{b[:300]}")
    # v2: identity + key fields
    if not parts and "identity" in soul_data:
        ident = soul_data["identity"]
        if isinstance(ident, dict):
            for k in ("name", "title", "company", "background", "one_line_summary", "identity_summary"):
                v = ident.get(k)
                if v:
                    parts.append(f"{k}: {v}")
    # v2: cognitive architecture
    if "cognitive_architecture" in soul_data:
        ca = soul_data["cognitive_architecture"]
        if isinstance(ca, dict):
            for k in ("core_thinking_pattern", "intellectual_style", "decision_framework"):
                v = ca.get(k)
                if v:
                    parts.append(f"{k}: {v[:300]}")
    # Fallback: stringify first 1500 chars
    if not parts:
        return json.dumps(soul_data, ensure_ascii=False)[:1500]
    return "\n".join(parts)[:1500]


async def expire_old_moments(db: AsyncSession) -> int:
    """Mark expired status for moments past expires_at and not yet acted on."""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(PersonaMoment).where(
            and_(
                PersonaMoment.expires_at < now,
                PersonaMoment.status.in_(("unread", "read")),
            )
        )
    )
    rows = res.scalars().all()
    for m in rows:
        m.status = "expired"
    if rows:
        await db.commit()
    return len(rows)


async def backfill_presets_watch_topics(
    db: AsyncSession,
    lang: str = "en",
    batch_size: int = 20,
    delay_seconds: float = 1.5,
) -> dict:
    """For all preset personas (user_id IS NULL) without watch topics, generate them.

    This is a one-shot backfill, meant to be run from a script.
    """
    # Find preset personas without watch topics in the given lang
    sql = """
        SELECT p.id, p.name, p.description
        FROM personas p
        WHERE p.user_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM persona_watch_topics t
            WHERE t.persona_id = p.id AND t.source_lang = :lang
          )
    """
    from sqlalchemy import text
    res = await db.execute(text(sql), {"lang": lang})
    rows = res.fetchall()

    total = len(rows)
    success = 0
    failed = []
    print(f"[momentum] backfill: {total} personas to process (lang={lang})", flush=True)

    for i, (pid, name, desc) in enumerate(rows):
        try:
            persona = await db.get(Persona, pid)
            if not persona:
                continue
            await auto_populate_watch_topics(persona, db, lang=lang)
            success += 1
            if (i + 1) % 10 == 0:
                print(f"[momentum] backfill progress: {i+1}/{total}", flush=True)
            await asyncio.sleep(delay_seconds)
        except Exception as e:
            failed.append((pid, name, str(e)))
            print(f"[momentum] backfill failed for {name}: {e}", flush=True)

    return {
        "total": total,
        "success": success,
        "failed": len(failed),
        "failures": failed[:10],
    }
