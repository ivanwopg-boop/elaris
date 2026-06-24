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
import time
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
from app.services.web_search import search_web

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

{current_facts_block}

You saw this article on the trending list and want to comment on it:
Title: {article_title}
Content: {article_content}
Source: {article_url}

Task: Write an 80-150 word comment in YOUR voice about this news.

Rules:
1. Use your own perspective, vocabulary, and concerns.
2. Don't summarize — give your opinion. Be conversational.
3. Use the "Current facts about you" section if it gives you up-to-date context (company status, recent events, etc.). Do NOT invent facts that aren't there.
4. Don't fabricate facts. If the news is wrong, say so.
5. If the content is empty, write based on the title.
6. Respond in {lang} ({lang_label}).

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


# ── Current facts (online, time-sensitive) ──────────────────
# Process-level cache: {cache_key: (facts_str, ts)}
# cron restarts every 30 min, so the cache naturally expires.
_FACTS_CACHE: dict[str, tuple[str, float]] = {}
_FACTS_TTL_SECONDS = 24 * 3600  # 24h — facts change slowly

FACT_QUERY_PROMPT = """You are helping an AI persona platform craft search queries to look up the LATEST, TIME-SENSITIVE facts about a public figure.

Persona name: {persona_name}
Persona description: {description}
Lang: {lang_label}

Generate 2 short search queries that would surface THIS YEAR's news about this person, their companies, or their current status.

Rules:
- Queries should be time-sensitive: include the year 2026, or words like "latest", "current", "now"
- Should find public facts (company status, IPO/M&A, leadership, recent milestones), NOT personal gossip
- Avoid philosophical/belief queries — those are already in the persona's soul
- Output as JSON: {{"queries": ["query1", "query2"]}}
- Queries in {lang_label}.

Example for Elon Musk:
{{"queries": ["Elon Musk SpaceX IPO 2026 status", "Tesla latest news 2026"]}}

Example for Einstein (historical):
{{"queries": ["Einstein Nobel Prize legacy 2026", "physics discoveries confirmed Einstein theory 2026"]}}
"""

FACT_EXTRACT_PROMPT = """You are extracting time-sensitive, verifiable facts from search results about a public figure.

Persona: {persona_name}

Search results (each is a news snippet, possibly with title/url/content):
{results_block}

Task: Pull out 3-5 FACTUAL, TIME-SENSITIVE statements about this person or their work — things that would have been DIFFERENT or WRONG a year ago.

Examples of good facts:
- "SpaceX completed its IPO in June 2026 at a $400B valuation"
- "Tesla's 2026 Q1 deliveries reached 500,000 vehicles"
- "Einstein's 1921 photoelectric effect paper was confirmed by 2025 quantum experiments"

Examples of BAD facts (skip these):
- "He is a famous person" (too generic)
- "He believes in hard work" (already in soul, not time-sensitive)
- "He was born in 1879" (historical, not time-sensitive)

Output as JSON: {{"facts": ["fact 1", "fact 2", "fact 3"]}}
Write facts in {lang_label}.
If nothing time-sensitive is found, return an empty array.
"""


async def _get_current_facts(
    persona_name: str,
    description: str,
    lang: str = "en",
) -> str:
    """Search the web for the latest time-sensitive facts about a persona.

    Returns a multi-line fact string (empty if nothing found).
    Cached 24h in process memory.
    """
    lang_label = "Chinese" if lang == "zh" else "English"
    cache_key = f"{persona_name}:{lang}"
    now = time.time()

    # Cache hit?
    if cache_key in _FACTS_CACHE:
        cached_facts, ts = _FACTS_CACHE[cache_key]
        if now - ts < _FACTS_TTL_SECONDS:
            return cached_facts
        else:
            del _FACTS_CACHE[cache_key]

    # Step A: LLM generates 2 search queries (retry once on empty/parse fail)
    queries: list[str] = []
    for attempt in (1, 2):
        try:
            qprompt = FACT_QUERY_PROMPT.format(
                persona_name=persona_name,
                description=(description or persona_name)[:300],
                lang_label=lang_label,
            )
            qtext = await minimax_client.chat(
                [
                    {"role": "system", "content": "You output only valid JSON."},
                    {"role": "user", "content": qprompt},
                ],
                temperature=0.5 if attempt == 1 else 0.3,
                max_tokens=200,
            )
            qtext = (qtext or "").strip()
            if not qtext:
                raise ValueError("empty LLM response")
            if chr(96) * 3 in qtext:
                qtext = qtext.split(chr(96) * 3)[1]
                if qtext.startswith("json"):
                    qtext = qtext[4:]
                qtext = qtext.strip()
            qdata = json.loads(qtext)
            queries = [str(q).strip() for q in qdata.get("queries", []) if q][:2]
            if queries:
                break
        except Exception as e:
            print(f"[news_sync] fact-query gen attempt {attempt} failed for {persona_name}: {e}", flush=True)
            continue

    if not queries:
        return ""

    # Step B: Run web search (with relevance check + 1 retry)
    async def _do_search() -> list[dict]:
        sr = await search_web(queries)
        # Quality check: at least one result must mention the persona name
        # (case-insensitive). Otherwise SearXNG returned garbage like
        # "Web 2.0 calculatrice" — force a retry with stricter query.
        pname_lc = persona_name.lower()
        for q in sr:
            for hit in q.get("results", []):
                txt = (hit.get("title", "") + " " + hit.get("snippet", "")).lower()
                if pname_lc in txt or persona_name in hit.get("title", ""):
                    return sr
        return []  # signal "all results are irrelevant"

    try:
        sr = await _do_search()
        if not sr:
            print(f"[news_sync] fact-search low-quality for {persona_name}, retrying", flush=True)
            # Retry: tighten queries with quotes
            tight_queries = [f'"{persona_name}" {q.split(persona_name, 1)[-1].strip()}' for q in queries]
            tight_queries = [t for t in tight_queries if t and len(t) > 10][:2]
            if tight_queries:
                sr2 = await search_web(tight_queries)
                if sr2:
                    sr = sr2
    except Exception as e:
        print(f"[news_sync] fact-search failed for {persona_name}: {e}", flush=True)
        return ""

    # Flatten results into a text block (title + snippet)
    blocks = []
    for q in sr:
        for hit in q.get("results", [])[:5]:
            title = (hit.get("title") or "").strip()
            content = (hit.get("snippet") or hit.get("content") or "").strip()[:200]
            url = (hit.get("url") or "").strip()
            if not title and not content:
                continue
            line = f"- {title}"
            if content:
                line += f"\n  {content}"
            if url:
                line += f"\n  ({url})"
            blocks.append(line)
    if not blocks:
        return ""

    results_block = "\n".join(blocks)[:2000]

    # Step C: LLM extracts 3-5 facts (retry once on empty/parse fail)
    facts: list[str] = []
    for attempt in (1, 2):
        try:
            eprompt = FACT_EXTRACT_PROMPT.format(
                persona_name=persona_name,
                results_block=results_block,
                lang_label=lang_label,
            )
            etext = await minimax_client.chat(
                [
                    {"role": "system", "content": "You output only valid JSON. Respond in " + lang_label + "."},
                    {"role": "user", "content": eprompt},
                ],
                temperature=0.3 if attempt == 1 else 0.2,
                max_tokens=500,
            )
            etext = (etext or "").strip()
            if not etext:
                raise ValueError("empty LLM response")
            if chr(96) * 3 in etext:
                etext = etext.split(chr(96) * 3)[1]
                if etext.startswith("json"):
                    etext = etext[4:]
                etext = etext.strip()
            edata = json.loads(etext)
            facts = [str(f).strip() for f in edata.get("facts", []) if f]
            if facts:
                break
        except Exception as e:
            print(f"[news_sync] fact-extract attempt {attempt} failed for {persona_name}: {e}", flush=True)
            continue

    if not facts:
        return ""

    facts_str = "\n".join(f"- {f}" for f in facts[:5])
    _FACTS_CACHE[cache_key] = (facts_str, now)
    print(f"[news_sync] cached {len(facts)} facts for {persona_name} ({lang})", flush=True)
    return facts_str


async def persona_picks(
    persona_name: str,
    soul_data: dict,
    hot_list: list[dict],
    lang: str,
    description: str = "",
) -> list[dict]:
    """Two-step: (1) LLM picks headlines, (2) fetch content + LLM writes comment.
    Also pre-fetches current-facts (online, 24h cached) so the persona
    knows about events that happened after the soul was distilled.
    """
    soul_excerpt = _extract_soul_summary(soul_data)
    lang_label = "Chinese" if lang == "zh" else "English"

    # ── Step 0: Online current-facts (cached 24h) ──
    current_facts_str = await _get_current_facts(
        persona_name=persona_name,
        description=description or (soul_data.get("identity", {}) or {}).get("name") or persona_name,
        lang=lang,
    )
    if current_facts_str:
        current_facts_block = (
            f"Current facts about you (refreshed from the web on "
            f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}):\n"
            f"{current_facts_str}"
        )
    else:
        current_facts_block = "(no current facts found — comment based on soul + article only)"

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
            current_facts_block=current_facts_block,
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
        picks = await persona_picks(
            persona.name, soul_data, hot_list, lang_key,
            description=persona.description or "",
        )
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

        # Commit after every persona (each persona is independent work unit).
        # Was: `if generated % 5 == 0` — but that meant a run that died between
        # commits lost everything. Per-persona commit trades a few ms for safety.
        if generated > 0:
            await db.commit()
            print(f"[news_sync] committed persona {persona.name} ({lang_key}) — {generated} total so far", flush=True)

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
