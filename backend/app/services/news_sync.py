"""Momentum news sync pipeline: fetch news → LLM digest → generate moments.

Triggered by crontab every 30 min:
  cd /opt/elaris/backend && python3 -m app.services.news_sync

Flow:
  1. Fetch all active watch_topics (group by topic for dedup)
  2. For each topic, fetch news via SearXNG → GNews → Currents → NewsData.io
  3. For each (persona, news) pair, LLM digest → persona_comment
  4. Insert persona_moments (dedup by persona_id + source_hash)
  5. Expire old moments (>24h)
"""

import asyncio
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, and_, func, text

from app.models.db_models import (
    Persona, PersonaWatchTopic, PersonaMoment, PersonaSoul, User, Contact,
)
from app.core.minimax_client import minimax_client
from app.config import get_settings

settings = get_settings()

# ── News sources ──────────────────────────────────────────────
SEARXNG_URL = getattr(settings, "SEARXNG_URL", "http://127.0.0.1:8888")
SEARXNG_PROXY = getattr(settings, "SEARXNG_PROXY", None)
GNEWS_API_KEY = getattr(settings, "GNEWS_API_KEY", "")
CURRENTS_API_KEY = getattr(settings, "CURRENTS_API_KEY", "")
NEWSDATA_API_KEY = getattr(settings, "NEWSDATA_API_KEY", "")

# Daily call counters (in-memory, reset on restart — acceptable for cron)
_daily_calls: dict[str, int] = {"gnews": 0, "currents": 0, "newsdata": 0}

# ── LLM Digest Prompt ────────────────────────────────────────
DIGEST_PROMPT = """You are {persona_name}, expressing yourself in character.

Your soul / personality:
{soul_excerpt}

A news article just came out:
Title: {article_title}
Content: {article_content}
Source: {article_url}
Published: {article_published_at}

Task: Write a 100-200 word comment in YOUR voice about this news.

Rules:
1. Use your own perspective, vocabulary, and concerns.
2. Don't summarize the news — give your opinion / reaction.
3. Don't fabricate facts. If the news is wrong, say so.
4. End with a hook question to engage the user.
5. Be conversational, not formal. You're talking to a friend, not writing an essay.
6. Respond in {lang} ({lang_label}).

Return JSON with these fields:
{{"comment": "100-200 word comment in your voice", "emotion": "praising|criticizing|reflecting|questioning|celebrating", "hook_question": "a question to engage the user"}}"""


def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode("utf-8")).hexdigest()


# ── News fetching ─────────────────────────────────────────────
async def _fetch_searxng(topic: str, lang: str = "en") -> list[dict]:
    """Search SearXNG News mode. Returns list of {title, url, content, published_at}."""
    try:
        client_kwargs = {"timeout": 15.0}
        if SEARXNG_PROXY:
            client_kwargs["proxy"] = SEARXNG_PROXY
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.get(
                f"{SEARXNG_URL}/search",
                params={
                    "q": f"{topic} news",
                    "format": "json",
                    "categories": "news",
                    "language": lang if lang in ("en", "zh") else "en",
                    "time_range": "day",
                    "engines": "google,bing,startpage",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for r in data.get("results", [])[:3]:
                published = r.get("publishedDate") or r.get("pubdate") or ""
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": (r.get("content") or r.get("snippet") or "")[:2000],
                    "published_at": published,
                })
            return results
    except Exception as e:
        print(f"[news_sync] SearXNG failed for '{topic}': {e}", flush=True)
        return []


async def _fetch_gnews(topic: str, lang: str = "en") -> list[dict]:
    """GNews API (free: 200/day)."""
    if not GNEWS_API_KEY or _daily_calls.get("gnews", 0) >= 200:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://gnews.io/api/v4/search",
                params={
                    "q": topic,
                    "lang": lang if lang in ("en", "zh") else "en",
                    "max": 3,
                    "apikey": GNEWS_API_KEY,
                },
            )
            data = resp.json()
            _daily_calls["gnews"] = _daily_calls.get("gnews", 0) + 1
            results = []
            for a in data.get("articles", []):
                results.append({
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "content": (a.get("description") or a.get("content") or "")[:2000],
                    "published_at": a.get("publishedAt", ""),
                })
            return results
    except Exception as e:
        print(f"[news_sync] GNews failed for '{topic}': {e}", flush=True)
        return []


async def _fetch_currents(topic: str, lang: str = "en") -> list[dict]:
    """Currents API (free: 200/day)."""
    if not CURRENTS_API_KEY or _daily_calls.get("currents", 0) >= 200:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.currentsapi.services/v1/search",
                params={
                    "keywords": topic,
                    "language": lang if lang in ("en", "zh") else "en",
                    "limit": 3,
                    "apiKey": CURRENTS_API_KEY,
                },
            )
            data = resp.json()
            _daily_calls["currents"] = _daily_calls.get("currents", 0) + 1
            results = []
            for a in data.get("news", []):
                results.append({
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "content": (a.get("description") or "")[:2000],
                    "published_at": a.get("published", ""),
                })
            return results
    except Exception as e:
        print(f"[news_sync] Currents failed for '{topic}': {e}", flush=True)
        return []


async def _fetch_newsdata(topic: str, lang: str = "en") -> list[dict]:
    """NewsData.io (free: 200/day)."""
    if not NEWSDATA_API_KEY or _daily_calls.get("newsdata", 0) >= 200:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://newsdata.io/api/1/news",
                params={
                    "q": topic,
                    "language": lang if lang in ("en", "zh") else "en",
                    "size": 3,
                    "apikey": NEWSDATA_API_KEY,
                },
            )
            data = resp.json()
            _daily_calls["newsdata"] = _daily_calls.get("newsdata", 0) + 1
            results = []
            for a in data.get("results", []):
                results.append({
                    "title": a.get("title", ""),
                    "url": a.get("link", ""),
                    "content": (a.get("description") or a.get("content") or "")[:2000],
                    "published_at": a.get("pubDate", ""),
                })
            return results
    except Exception as e:
        print(f"[news_sync] NewsData failed for '{topic}': {e}", flush=True)
        return []


async def fetch_news(topic: str, lang: str = "en") -> list[dict]:
    """Fetch news with 4-tier fallback."""
    # P0: SearXNG (self-hosted, unlimited)
    results = await _fetch_searxng(topic, lang)
    if results:
        return results

    # P1: GNews (200/day)
    results = await _fetch_gnews(topic, lang)
    if results:
        return results

    # P2: Currents (200/day)
    results = await _fetch_currents(topic, lang)
    if results:
        return results

    # P3: NewsData.io (200/day)
    results = await _fetch_newsdata(topic, lang)
    return results


# ── LLM digestion ─────────────────────────────────────────────
def _extract_soul_summary(soul_data: dict) -> str:
    """Pull a ~1000-char summary from v2/v3 soul dict."""
    parts = []
    if "narrative_insight_cards" in soul_data:
        for card in soul_data["narrative_insight_cards"][:5]:
            if isinstance(card, dict):
                t = card.get("title") or card.get("card_title") or ""
                b = card.get("body") or card.get("text") or card.get("content") or ""
                if t:
                    parts.append(f"## {t}\n{b[:300]}")
    if not parts and "identity" in soul_data:
        ident = soul_data["identity"]
        if isinstance(ident, dict):
            for k in ("name", "title", "company", "background", "one_line_summary"):
                v = ident.get(k)
                if v:
                    parts.append(f"{k}: {v}")
    if "cognitive_architecture" in soul_data:
        ca = soul_data["cognitive_architecture"]
        if isinstance(ca, dict):
            for k in ("core_thinking_pattern", "intellectual_style", "decision_framework"):
                v = ca.get(k)
                if v:
                    parts.append(f"{k}: {v[:300]}")
    if not parts:
        return json.dumps(soul_data, ensure_ascii=False)[:1500]
    return "\n".join(parts)[:1500]


async def digest_news(
    persona_name: str,
    soul_data: dict,
    article: dict,
    lang: str = "en",
) -> Optional[dict]:
    """LLM digest: generate persona_comment from news article."""
    lang_label = {"en": "English", "zh": "中文", "zh-CN": "中文"}.get(lang, lang)
    soul_excerpt = _extract_soul_summary(soul_data)
    prompt = DIGEST_PROMPT.format(
        persona_name=persona_name,
        soul_excerpt=soul_excerpt,
        article_title=article["title"],
        article_content=article.get("content", ""),
        article_url=article.get("url", ""),
        article_published_at=article.get("published_at", ""),
        lang=lang,
        lang_label=lang_label,
    )

    try:
        text = await minimax_client.chat(
            [
                {"role": "system", "content": "You output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=600,
        )
        text = (text or "").strip()
        # Strip markdown fences
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"[news_sync] digest failed for {persona_name}: {e}", flush=True)
        return None


# ── Main sync loop ────────────────────────────────────────────
async def run_sync(db: AsyncSession):
    """Main sync: fetch news for all active watch topics, digest, and generate moments."""
    now = datetime.now(timezone.utc)

    # ── Step 1: Fetch all active watch topics ──
    topics_res = await db.execute(
        select(PersonaWatchTopic).where(PersonaWatchTopic.is_active == True)
    )
    all_topics = topics_res.scalars().all()
    if not all_topics:
        print("[news_sync] no active watch topics, exiting", flush=True)
        return {"generated": 0, "skipped": 0, "errors": 0}

    print(f"[news_sync] processing {len(all_topics)} active watch topics", flush=True)

    # Deduplicate by (topic_text, source_lang) — same topic only searched once
    topic_groups: dict[tuple, list[PersonaWatchTopic]] = {}
    for t in all_topics:
        key = (t.topic.strip().lower(), t.source_lang)
        topic_groups.setdefault(key, []).append(t)

    unique_topics = list(topic_groups.values())
    print(f"[news_sync] {len(unique_topics)} unique topic+lang groups", flush=True)

    generated = 0
    skipped = 0
    errors = 0

    for group in unique_topics:
        rep = group[0]  # representative watch_topic row
        topic_text = rep.topic.strip()
        lang = rep.source_lang

        # ── Step 2: Fetch news for this topic ──
        articles = await fetch_news(topic_text, lang)
        if not articles:
            print(f"[news_sync] no news for topic '{topic_text}'", flush=True)
            continue

        # ── Step 3: For each article × each persona in the group ──
        for article in articles:
            source_hash = _hash_url(article["url"])
            if not article.get("title"):
                continue

            for wt in group:
                try:
                    # Dedup check
                    existing = await db.execute(
                        select(func.count(PersonaMoment.id)).where(
                            and_(
                                PersonaMoment.persona_id == wt.persona_id,
                                PersonaMoment.source_hash == source_hash,
                            )
                        )
                    )
                    if (existing.scalar() or 0) > 0:
                        skipped += 1
                        continue

                    # Get persona
                    persona = await db.get(Persona, wt.persona_id)
                    if not persona:
                        continue

                    # Get soul
                    soul_res = await db.execute(
                        select(PersonaSoul)
                        .where(and_(PersonaSoul.persona_id == persona.id, PersonaSoul.lang == lang))
                        .order_by(PersonaSoul.version.desc())
                        .limit(1)
                    )
                    soul_row = soul_res.scalar_one_or_none()
                    if not soul_row:
                        continue
                    try:
                        soul_data = json.loads(soul_row.soul_json)
                    except Exception:
                        continue

                    # LLM digest
                    digest = await digest_news(persona.name, soul_data, article, lang)
                    if not digest:
                        errors += 1
                        continue

                    comment = (digest.get("comment") or "").strip()
                    if len(comment) < 20:
                        errors += 1
                        continue

                    # Determine user_id: preset personas get NULL, user personas get their owner
                    target_user_id = persona.user_id  # None for presets

                    # For presets (NULL user_id), we generate moments for ALL users who have this persona as contact
                    if target_user_id is None:
                        # Get all users who have this persona as a contact
                        contact_users_res = await db.execute(
                            select(Contact.user_id).where(Contact.persona_id == persona.id)
                        )
                        contact_user_ids = [r[0] for r in contact_users_res.fetchall()]
                        if not contact_user_ids:
                            continue
                        # Generate one moment per user
                        for uid in contact_user_ids:
                            m = PersonaMoment(
                                id=str(__import__("uuid").uuid4()),
                                persona_id=persona.id,
                                user_id=uid,
                                watch_topic_id=wt.id,
                                source_url=article["url"],
                                source_title=article["title"],
                                source_content=article.get("content", ""),
                                source_published_at=article.get("published_at", ""),
                                source_lang=lang,
                                source_hash=source_hash,
                                persona_comment=comment,
                                emotion=digest.get("emotion", "reflecting"),
                                hook_question=digest.get("hook_question"),
                                status="unread",
                                created_at=now,
                                expires_at=now + timedelta(hours=24),
                            )
                            db.add(m)
                            generated += 1
                    else:
                        m = PersonaMoment(
                            id=str(__import__("uuid").uuid4()),
                            persona_id=persona.id,
                            user_id=target_user_id,
                            watch_topic_id=wt.id,
                            source_url=article["url"],
                            source_title=article["title"],
                            source_content=article.get("content", ""),
                            source_published_at=article.get("published_at", ""),
                            source_lang=lang,
                            source_hash=source_hash,
                            persona_comment=comment,
                            emotion=digest.get("emotion", "reflecting"),
                            hook_question=digest.get("hook_question"),
                            status="unread",
                            created_at=now,
                            expires_at=now + timedelta(hours=24),
                        )
                        db.add(m)
                        generated += 1

                    # Commit every batch of 10
                    if generated % 10 == 0:
                        await db.commit()
                        print(f"[news_sync] committed {generated} moments so far", flush=True)

                except Exception as e:
                    errors += 1
                    print(f"[news_sync] error processing wt={wt.id} article={article.get('url','?')[:50]}: {e}", flush=True)
                    continue

            # Small delay between articles to be gentle on APIs
            await asyncio.sleep(0.5)

    # Final commit
    await db.commit()

    # ── Step 4: Expire old moments ──
    expire_res = await db.execute(
        select(PersonaMoment).where(
            and_(
                PersonaMoment.expires_at < now,
                PersonaMoment.status.in_(("unread", "read")),
            )
        )
    )
    expired_count = 0
    for m in expire_res.scalars().all():
        m.status = "expired"
        expired_count += 1
    if expired_count:
        await db.commit()

    print(
        f"[news_sync] done: generated={generated}, skipped={skipped}, errors={errors}, expired={expired_count}",
        flush=True,
    )
    return {"generated": generated, "skipped": skipped, "errors": errors, "expired": expired_count}


async def main():
    """Entry point for crontab."""
    db_url = settings.DATABASE_URL
    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = await run_sync(db)

    await engine.dispose()
    print(f"[news_sync] result: {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
