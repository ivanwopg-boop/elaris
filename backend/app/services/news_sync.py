"""Momentum news sync pipeline: fetch news via NewsNow → LLM digest → generate moments.

Triggered by crontab every 30 min:
  cd /opt/elaris/backend && venv/bin/python3 -m app.services.news_sync

Flow:
  1. Fetch all active watch_topics (group by topic for dedup)
  2. For each topic, fetch news via SearXNG → NewsNow (Lang-aware source pick)
  3. For each (persona, news) pair, LLM digest → persona_comment
  4. Insert persona_moments (dedup by persona_id + source_hash)
  5. Expire old moments (>24h)

History:
  - 2026-06-17: initial design with SearXNG + GNews + Currents + NewsData.io
  - 2026-06-23: rewrote to use NewsNow (30+ free sources, no API key needed)
    and use venv python + app.database.async_session
"""

import asyncio
import hashlib
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# Add backend to path (cron-friendly)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import httpx
from sqlalchemy import select, and_, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import (
    Persona, PersonaWatchTopic, PersonaMoment, PersonaSoul, User, Contact,
)
from app.core.minimax_client import minimax_client
from app.database import async_session as make_async_session
from app.config import get_settings

settings = get_settings()

# ── News sources ──────────────────────────────────────────────
SEARXNG_URL = getattr(settings, "SEARXNG_URL", "http://127.0.0.1:8888")
SEARXNG_PROXY = getattr(settings, "SEARXNG_PROXY", None)


# ── LLM Digest Prompt ────────────────────────────────────────
DIGEST_PROMPT = """You are {persona_name}, expressing yourself in character.

Your soul / personality:
{soul_excerpt}

A news article just came out:
Title: {article_title}
Content: {article_content}
Source: {article_url}
Published: {article_published_at}
Trending score: {article_score}

Task: Write a 100-200 word comment in YOUR voice about this news.

Rules:
1. Use your own perspective, vocabulary, and concerns.
2. Don't summarize the news — give your opinion / reaction.
3. Don't fabricate facts. If the news is wrong, say so.
4. Be conversational, not formal. You're talking to a friend, not writing an essay.
5. If content is empty (hot-list only), infer context from title + your expertise.
6. Respond in {lang} ({lang_label}).

Return JSON with these fields:
{{"comment": "100-200 word comment in your voice", "emotion": "praising|criticizing|reflecting|questioning|celebrating"}}"""


def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode("utf-8")).hexdigest()


def _parse_published_at(raw) -> "datetime | None":
    """Coerce various date string formats into a tz-aware datetime, or None.

    SQLite DateTime column only accepts datetime/date objects. Many news sources
    return ISO 8601 strings, RFC 2822, or just garbage — we try to parse and
    silently return None if we can't. Used by source_published_at field.
    """
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw:
        return None
    from datetime import datetime as _dt, timezone as _tz
    # ISO 8601 with TZ
    try:
        return _dt.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        pass
    # RFC 2822 (e.g. "Tue, 23 Jun 2026 10:24:00 GMT")
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(raw)
        if d is not None:
            return d.astimezone(_tz.utc)
    except Exception:
        pass
    # Common datetime formats
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return _dt.strptime(raw, fmt).replace(tzinfo=_tz.utc)
        except Exception:
            continue
    return None


# ── News fetching: SearXNG (P0) + NewsNow (P1) ───────────────
async def _fetch_searxng(topic: str, lang: str = "en") -> list[dict]:
    """Search SearXNG News mode. Returns list of {title, url, content, published_at, score}."""
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
                    "score": "",
                    "source": "searxng",
                })
            return results
    except Exception as e:
        print(f"[news_sync] SearXNG failed for '{topic}': {e}", flush=True)
        return []


# Lang-aware source picker for NewsNow
# Maps each topic's lang → list of source IDs most likely to have content
_NEWSNOW_LANG_SOURCES = {
    "en":   ["hackernews", "producthunt", "github-trending-today", "wallstreetcn-quick", "fastbull-express"],
    "zh":   ["weibo", "zhihu", "toutiao", "_36kr", "ithome", "cls-telegraph"],
    "zh-CN":["weibo", "zhihu", "tencent-hot", "ithome", "_36kr", "cls-telegraph", "jin10"],
}

# NewsNow browser headers (Cloudflare bypass)
_NEWSNOW_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Referer": "https://newsnow.busiyi.world/",
    "Origin": "https://newsnow.busiyi.world",
}


async def _newsnow_source(source_id: str, count: int = 5) -> list[dict]:
    """Fetch hot list from a single NewsNow source."""
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(
                "https://newsnow.busiyi.world/api/s",
                params={"id": source_id, "n": count},
                headers=_NEWSNOW_HEADERS,
            )
            if r.status_code != 200:
                return []
            data = r.json()
    except Exception as e:
        print(f"[news_sync] NewsNow[{source_id}] error: {e}", flush=True)
        return []

    out = []
    for it in data.get("items", [])[:count]:
        url = it.get("url", "")
        title = (it.get("title") or "").strip()
        if not url or not title:
            continue
        extra = it.get("extra") or {}
        out.append({
            "title": title,
            "url": url,
            "content": "",  # NewsNow is hot-list, no body — LLM digests from title
            "published_at": "",
            "score": extra.get("info", ""),
            "source": f"newsnow:{source_id}",
        })
    return out


async def _fetch_newsnow(topic: str, lang: str = "en") -> list[dict]:
    """Fetch from NewsNow using lang-picked sources, then keyword-filter by topic.

    Strategy: cast a wide net (5-6 sources per lang), then client-side filter by
    topic keywords to drop irrelevant hot items. Result: topical hot-news feed
    for the persona's watch_topic.
    """
    source_ids = _NEWSNOW_LANG_SOURCES.get(lang, _NEWSNOW_LANG_SOURCES["en"])
    has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in topic)

    import re as _re
    if has_cjk:
        # CN topic: match any CJK 2+ char segment (no persona-name stripping — topics are short)
        keywords = [k for k in _re.findall(r"[\u4e00-\u9fff]{2,}", topic) if len(k) >= 2][:6]
    else:
        # EN topic: extract content words, drop stopwords
        stop = {"the", "a", "an", "in", "on", "for", "of", "to", "with",
                "and", "or", "at", "by", "is", "are", "was", "be"}
        keywords = [w.lower() for w in _re.findall(r"[a-zA-Z]{3,}", topic)
                    if w.lower() not in stop][:6]
    if not keywords:
        keywords = []

    # Fetch 8 items per source in parallel
    tasks = [_newsnow_source(sid, count=8) for sid in source_ids]
    raw = await asyncio.gather(*tasks, return_exceptions=True)

    merged = []
    seen_titles = set()
    for sid, items in zip(source_ids, raw):
        if not isinstance(items, list):
            continue
        for it in items:
            title = it["title"].strip().lower()
            if title in seen_titles:
                continue
            # Filter: keep if any topic keyword matches title, OR (if no keywords) keep all
            if keywords and not any(kw.lower() in title for kw in keywords):
                continue
            seen_titles.add(title)
            merged.append(it)
            if len(merged) >= 6:
                break
        if len(merged) >= 6:
            break
    return merged[:5]


async def fetch_news(topic: str, lang: str = "en") -> list[dict]:
    """Fetch news with SearXNG → NewsNow fallback."""
    # P0: SearXNG (self-hosted, unlimited) — works well for English news
    results = await _fetch_searxng(topic, lang)
    if results:
        return results

    # P1: NewsNow (30+ sources, free, no API key) — works for EN + CN
    results = await _fetch_newsnow(topic, lang)
    if results:
        print(f"[news_sync] NewsNow rescued {len(results)} items for '{topic}' (lang={lang})", flush=True)
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
        article_content=article.get("content", "") or "(hot-list only, no article body)",
        article_url=article.get("url", ""),
        article_published_at=article.get("published_at", "") or "(unknown)",
        article_score=article.get("score", ""),
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
        if chr(96)*3 in text:
            text = text.split(chr(96)*3)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"[news_sync] digest failed for {persona_name}: {e}", flush=True)
        return None


# ── Main sync loop ────────────────────────────────────────────
async def run_sync(db: AsyncSession):
    """Main sync: fetch news for all active watch topics, digest, generate moments."""
    import uuid
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

    # Deduplicate by (topic_text, source_lang) — same topic searched once
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
        rep = group[0]
        topic_text = rep.topic.strip()
        lang = rep.source_lang

        # ── Step 2: Fetch news for this topic ──
        articles = await fetch_news(topic_text, lang)
        if not articles:
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

                    # Determine user_id: preset personas fan out, user personas single
                    target_user_id = persona.user_id  # None for presets

                    if target_user_id is None:
                        # Preset persona: generate moment for every user who has it as contact
                        contact_users_res = await db.execute(
                            select(Contact.user_id).where(Contact.persona_id == persona.id)
                        )
                        contact_user_ids = [r[0] for r in contact_users_res.fetchall()]
                        if not contact_user_ids:
                            continue
                        for uid in contact_user_ids:
                            m = PersonaMoment(
                                id=str(uuid.uuid4()),
                                persona_id=persona.id,
                                user_id=uid,
                                watch_topic_id=wt.id,
                                source_url=article["url"],
                                source_title=article["title"],
                                source_content=article.get("content", ""),
                                source_published_at=_parse_published_at(article.get("published_at", "")),
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
                        # User-owned persona: single moment for the owner
                        m = PersonaMoment(
                            id=str(uuid.uuid4()),
                            persona_id=persona.id,
                            user_id=target_user_id,
                            watch_topic_id=wt.id,
                            source_url=article["url"],
                            source_title=article["title"],
                            source_content=article.get("content", ""),
                            source_published_at=_parse_published_at(article.get("published_at", "")),
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

                    if generated % 10 == 0:
                        await db.commit()
                        print(f"[news_sync] committed {generated} moments so far", flush=True)

                except Exception as e:
                    errors += 1
                    await db.rollback()  # critical: don't let one bad insert poison the whole session
                    print(f"[news_sync] error processing wt={wt.id} article={article.get('url','?')[:50]}: {type(e).__name__}: {e}", flush=True)
                    continue

            await asyncio.sleep(0.3)

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
    async with make_async_session() as db:
        result = await run_sync(db)
    print(f"[news_sync] result: {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
