"""Momentum news sync: persona comments on NewsNow trending hot list.

Triggered by crontab every 30 min:
  cd /opt/elaris/backend && venv/bin/python3 -m app.services.news_sync

Flow:
  1. Fetch hot list from NewsNow (12 sources, ~200 items)
  2. Deduplicate by title
  3. For each persona with a soul: LLM picks 1-3 items + writes comment
  4. Insert persona_moments (dedup by persona_id + source_hash)
  5. Expire / purge old moments

2026-06-23: Rewrote from "search by watch_topic" to "persona reads hot list".
  Old: per-topic SearXNG/NewsNow search → keyword filter → LLM digest
  New: pull hot list once → each persona picks what they care about
"""

import asyncio
import hashlib
import json
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import httpx
from sqlalchemy import select, and_, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import (
    Persona, PersonaMoment, PersonaSoul, User, Contact,
)
from app.core.minimax_client import minimax_client
from app.database import async_session as make_async_session
from app.config import get_settings

settings = get_settings()

# ── NewsNow sources ──────────────────────────────────────────
NEWSNOW_URL = "https://newsnow.busiyi.world/api/s"
NEWSNOW_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Referer": "https://newsnow.busiyi.world/",
    "Origin": "https://newsnow.busiyi.world",
}

# Lang → source IDs
NEWSNOW_SOURCES_EN = [
    "hackernews", "producthunt", "github-trending-today",
    "jin10", "wallstreetcn-quick",
]
NEWSNOW_SOURCES_ZH = [
    "weibo", "zhihu", "ithome", "bilibili-hot-search",
    "coolapk", "v2ex-share", "tencent-hot", "cls-hot",
]

# ── Hot list fetch ───────────────────────────────────────────
async def _pull_source(source_id: str, count: int = 15) -> list[dict]:
    """Pull hot news from a single NewsNow source."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(
                NEWSNOW_URL,
                params={"id": source_id, "n": count},
                headers=NEWSNOW_HEADERS,
            )
            if r.status_code != 200:
                return []
            data = r.json()
    except Exception as e:
        print(f"[news_sync] NewsNow[{source_id}] error: {e}", flush=True)
        return []

    out = []
    for it in data.get("items", []):
        url = it.get("url", "")
        title = (it.get("title") or "").strip()
        if not url or not title:
            continue
        extra = it.get("extra") or {}
        out.append({
            "title": title,
            "url": url,
            "score": extra.get("info", ""),
            "source": source_id,
        })
    return out


async def fetch_hot_list() -> dict[str, list[dict]]:
    """Pull hot list from all NewsNow sources, deduplicate by title.
    Returns {"en": [...], "zh": [...]}
    """
    all_tasks = []
    all_labels = []

    for sid in NEWSNOW_SOURCES_EN:
        all_tasks.append(_pull_source(sid, count=15))
        all_labels.append(("en", sid))

    for sid in NEWSNOW_SOURCES_ZH:
        all_tasks.append(_pull_source(sid, count=15))
        all_labels.append(("zh", sid))

    raw = await asyncio.gather(*all_tasks, return_exceptions=True)

    en_items: list[dict] = []
    zh_items: list[dict] = []
    seen = set()

    for (lang, sid), items in zip(all_labels, raw):
        if not isinstance(items, list):
            continue
        for it in items:
            key = it["title"].strip().lower()
            if key in seen or len(key) < 4:
                continue
            seen.add(key)
            it["source"] = sid
            if lang == "en":
                en_items.append(it)
            else:
                zh_items.append(it)

    print(f"[news_sync] hot list: en={len(en_items)} zh={len(zh_items)}", flush=True)
    return {"en": en_items, "zh": zh_items}


# ── Persona picks & digests ──────────────────────────────────
PICK_PROMPT = """You are {persona_name}, browsing today's trending news.

Your personality and voice:
{soul_excerpt}

Below is today's hot list. Pick 1-3 headlines that you, {persona_name}, would naturally care about and want to comment on.

HOT LIST:
{hot_list}

Rules:
1. Pick headlines about YOUR field, interests, or things that would provoke YOUR opinion.
2. Skip anything irrelevant to you — you don't need to comment on everything.
3. For each pick, write a 80-150 word comment in YOUR voice.
4. Don't summarize — give your perspective. Be conversational.
5. If nothing on the list interests you, return an empty picks array.

Return JSON:
{{"picks": [
  {{"index": <number matching the headline number above>,
    "comment": "your comment in your voice",
    "emotion": "praising|criticizing|reflecting|questioning|celebrating"}}
]}}"""


def _extract_soul_summary(soul_data: dict) -> str:
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


def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode("utf-8")).hexdigest()
# ── Persona picks & digests ──────────────────────────────────

PICK_PROMPT = """You are {persona_name}, browsing today's trending news.

Your personality and voice:
{soul_excerpt}

Below is today's hot list. Pick 1-3 headlines that you, {persona_name}, would naturally care about and want to comment on.

HOT LIST:
{hot_list}

Rules:
1. Pick headlines about YOUR field, interests, or things that would provoke YOUR opinion.
2. Skip anything irrelevant — you don't need to comment on everything.
3. If nothing interests you, return an empty picks array.
4. Only return the index numbers — we'll fetch the full article text for you next.

Return JSON:
{{"picks": [{{"index": <number>}}]}}"""


DIGEST_PROMPT = """You are {persona_name}, expressing yourself in character.

Your soul / personality:
{soul_excerpt}

You saw this article on the trending list and want to comment on it:
Title: {article_title}
Content: {article_content}
Source: {article_url}

Task: Write an 80-150 word comment in YOUR voice about this news.

Rules:
1. Use your own perspective, vocabulary, and concerns.
2. Don't summarize — give your opinion. Be conversational.
3. Don't fabricate facts. If the news is wrong, say so.
4. If the content is empty, write based on the title.
5. Respond in {lang} ({lang_label}).

Return JSON:
{{"comment": "your comment", "emotion": "praising|criticizing|reflecting|questioning|celebrating"}}"""


async def _fetch_article_content(url: str, timeout: int = 8) -> str:
    """Fetch article text from URL. Returns up to 3000 chars."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
            r = await c.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            })
            if r.status_code != 200:
                return ""
            html = r.text[:50000]
    except Exception:
        return ""

    # Simple text extraction: strip HTML tags
    import re
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # Limit to ~3000 chars
    return text[:3000]


async def persona_picks(
    persona_name: str,
    soul_data: dict,
    hot_list: list[dict],
    lang: str,
) -> list[dict]:
    """Two-step: (1) LLM picks headlines, (2) fetch content + LLM writes comment."""
    soul_excerpt = _extract_soul_summary(soul_data)
    lang_label = "Chinese" if lang == "zh" else "English"

    # ── Step 1: Pick headlines ──
    lines = [f"{i}. [{item['source']}] {item['title']}" for i, item in enumerate(hot_list)]
    pick_prompt = PICK_PROMPT.format(
        persona_name=persona_name,
        soul_excerpt=soul_excerpt,
        hot_list="\n".join(lines),
    )

    try:
        text = await minimax_client.chat(
            [
                {"role": "system", "content": "You output only valid JSON."},
                {"role": "user", "content": pick_prompt},
            ],
            temperature=0.8,
            max_tokens=400,
        )
        text = (text or "").strip()
        if chr(96) * 3 in text:
            text = text.split(chr(96) * 3)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
        indices = [p.get("index", -1) for p in data.get("picks", [])]
        indices = [i for i in indices if 0 <= i < len(hot_list)]
    except Exception as e:
        print(f"[news_sync] pick failed for {persona_name}: {e}", flush=True)
        return []

    if not indices:
        return []

    # ── Step 2: Fetch article content (parallel) ──
    fetch_tasks = [_fetch_article_content(hot_list[i]["url"]) for i in indices]
    contents = await asyncio.gather(*fetch_tasks, return_exceptions=True)

    # ── Step 3: Write comments (one LLM call per article) ──
    out = []
    for idx, content in zip(indices, contents):
        item = hot_list[idx]
        if not isinstance(content, str):
            content = ""
        digest_prompt = DIGEST_PROMPT.format(
            persona_name=persona_name,
            soul_excerpt=soul_excerpt,
            article_title=item["title"],
            article_content=content[:2000] or "(content unavailable)",
            article_url=item["url"],
            lang=lang,
            lang_label=lang_label,
        )
        try:
            text = await minimax_client.chat(
                [
                    {"role": "system", "content": "You output only valid JSON. Respond in " + lang_label + "."},
                    {"role": "user", "content": digest_prompt},
                ],
                temperature=0.8,
                max_tokens=600,
            )
            text = (text or "").strip()
            if chr(96) * 3 in text:
                text = text.split(chr(96) * 3)[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            data = json.loads(text)
            comment = (data.get("comment") or "").strip()
            if len(comment) >= 30:
                out.append({
                    "title": item["title"],
                    "url": item["url"],
                    "source": item["source"],
                    "comment": comment,
                    "emotion": data.get("emotion", "reflecting"),
                })
        except Exception as e:
            print(f"[news_sync] digest failed for {persona_name}: {e}", flush=True)
            continue

    return out


# ── Main sync loop ────────────────────────────────────────────
async def run_sync(db: AsyncSession):
    now = datetime.now(timezone.utc)

    # ── Step 1: Pull hot list ──
    hot = await fetch_hot_list()
    if not hot["en"] and not hot["zh"]:
        print("[news_sync] empty hot list, exiting", flush=True)
        return {"generated": 0, "skipped": 0, "errors": 0}

    # ── Step 2: Find personas with souls ──
    soul_rows = await db.execute(
        select(PersonaSoul).order_by(PersonaSoul.persona_id, PersonaSoul.version.desc())
    )
    souls = soul_rows.scalars().all()
    # Dedup by persona_id (keep latest version)
    persona_souls: dict[str, PersonaSoul] = {}
    for s in souls:
        if s.persona_id not in persona_souls:
            persona_souls[s.persona_id] = s

    if not persona_souls:
        print("[news_sync] no personas with souls, exiting", flush=True)
        return {"generated": 0, "skipped": 0, "errors": 0}

    print(f"[news_sync] processing {len(persona_souls)} personas", flush=True)

    generated = skipped = errors = 0

    for pid, soul in persona_souls.items():
        persona = await db.get(Persona, pid)
        if not persona:
            continue

        try:
            soul_data = json.loads(soul.soul_json)
        except Exception:
            continue

        lang = soul.lang  # "en" or "zh-CN"
        lang_key = "zh" if lang.startswith("zh") else "en"
        hot_list = hot.get(lang_key, [])
        if not hot_list:
            continue

        # LLM picks + digests
        picks = await persona_picks(persona.name, soul_data, hot_list, lang_key)
        if not picks:
            continue

        target_user_id = persona.user_id  # None for presets

        for article in picks:
            source_hash = _hash_url(article["url"])
            comment = article["comment"]
            if len(comment) < 20:
                continue

            if target_user_id is None:
                # Preset: fan out to all contacts
                contact_users = await db.execute(
                    select(Contact.user_id).where(Contact.persona_id == persona.id)
                )
                contact_ids = [r[0] for r in contact_users.fetchall()]
                for uid in contact_ids:
                    # Dedup
                    exists = await db.execute(
                        select(func.count(PersonaMoment.id)).where(
                            and_(PersonaMoment.persona_id == pid, PersonaMoment.source_hash == source_hash)
                        )
                    )
                    if (exists.scalar() or 0) > 0:
                        skipped += 1
                        continue
                    db.add(PersonaMoment(
                        id=str(uuid.uuid4()),
                        persona_id=pid,
                        user_id=uid,
                        source_url=article["url"],
                        source_title=article["title"],
                        source_content="",
                        source_lang=lang,
                        source_hash=source_hash,
                        persona_comment=comment,
                        emotion=article.get("emotion", "reflecting"),
                        status="unread",
                        created_at=now,
                        expires_at=now + timedelta(hours=24),
                    ))
                    generated += 1
            else:
                exists = await db.execute(
                    select(func.count(PersonaMoment.id)).where(
                        and_(PersonaMoment.persona_id == pid, PersonaMoment.source_hash == source_hash)
                    )
                )
                if (exists.scalar() or 0) > 0:
                    skipped += 1
                    continue
                db.add(PersonaMoment(
                    id=str(uuid.uuid4()),
                    persona_id=pid,
                    user_id=target_user_id,
                    source_url=article["url"],
                    source_title=article["title"],
                    source_content="",
                    source_lang=lang,
                    source_hash=source_hash,
                    persona_comment=comment,
                    emotion=article.get("emotion", "reflecting"),
                    status="unread",
                    created_at=now,
                    expires_at=now + timedelta(hours=24),
                ))
                generated += 1

        if generated % 5 == 0:
            await db.commit()
            print(f"[news_sync] committed {generated} moments so far", flush=True)

    await db.commit()

    # ── Step 3: Expire old moments ──
    expire_res = await db.execute(
        select(PersonaMoment).where(
            and_(PersonaMoment.expires_at < now, PersonaMoment.status.in_(("unread", "read")))
        )
    )
    expired_count = 0
    for m in expire_res.scalars().all():
        m.status = "expired"
        expired_count += 1
    if expired_count:
        await db.commit()

    # ── Step 4: Purge old expired (>48h) ──
    purge_cutoff = now - timedelta(hours=48)
    purge_res = await db.execute(
        select(PersonaMoment).where(
            and_(PersonaMoment.status == "expired", PersonaMoment.expires_at < purge_cutoff)
        )
    )
    purged = 0
    for m in purge_res.scalars().all():
        await db.delete(m)
        purged += 1
    if purged:
        await db.commit()

    print(
        f"[news_sync] done: generated={generated}, skipped={skipped}, "
        f"errors={errors}, expired={expired_count}, purged={purged}",
        flush=True,
    )
    return {
        "generated": generated, "skipped": skipped, "errors": errors,
        "expired": expired_count, "purged": purged,
    }


async def main():
    async with make_async_session() as db:
        result = await run_sync(db)
    print(f"[news_sync] result: {json.dumps(result, ensure_ascii=False)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
