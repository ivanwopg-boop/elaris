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
from urllib.parse import quote_plus
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
from app.services.news_categories import (
    get_categories_for_persona,
    get_keywords_for_categories,
    news_matches_categories,
)

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
    # Round 3 2026-06-24
    "mktnews", "steam",
]
NEWSNOW_SOURCES_ZH = [
    "weibo", "zhihu", "ithome", "bilibili-hot-search",
    "coolapk", "v2ex-share", "tencent-hot", "cls-hot",
    # Newly added 2026-06-24:
    "toutiao", "baidu", "thepaper", "ifeng", "tieba", "douyin",
    "wallstreetcn-hot", "jin10",
    # Round 3: full NewsNow source audit 2026-06-24
    "aihot", "cankaoxiaoxi", "chongbuluo", "douban", "fastbull",
    "freebuf", "gelonghui", "hupu", "iqiyi", "juejin", "kaopu",
    "nowcoder", "pcbeta", "qqvideo", "solidot", "sputniknewscn", "sspai",
    "tencent", "xueqiu", "zaobao",
]

# ── Google News RSS (free EN source) ─────────────────────────
GOOGLE_NEWS_QUERIES = [
    # Broad category searches — covers most persona types
    ("business OR finance OR stock OR market", "us"),
    ("technology OR AI OR science OR research", "us"),
    ("entertainment OR music OR movie OR celebrity", "us"),
    ("politics OR government OR diplomacy", "us"),
    ("sports OR football OR basketball OR olympic", "us"),
]



# Additional free EN RSS feeds (BBC, NYT, NPR, Guardian — no API keys)
EN_RSS_FEEDS = [
    ("https://feeds.bbci.co.uk/news/world/rss.xml", "bbc-world"),
    ("https://feeds.bbci.co.uk/news/business/rss.xml", "bbc-business"),
    ("https://feeds.bbci.co.uk/news/technology/rss.xml", "bbc-tech"),
    ("https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", "nyt"),
    ("https://feeds.npr.org/1001/rss.xml", "npr"),
    ("https://www.theguardian.com/world/rss", "guardian"),
    # Additional EN RSS feeds 2026-06-24
    ("https://www.cnbc.com/id/100727362/device/rss/rss.html", "cnbc"),
    ("https://techcrunch.com/feed/", "techcrunch"),
    ("https://arstechnica.com/feed/", "arstechnica"),
    ("https://www.engadget.com/rss.xml", "engadget"),
    ("https://www.aljazeera.com/xml/rss/all.xml", "aljazeera"),
    ("https://www.france24.com/en/rss", "france24"),
    ("https://feeds.bloomberg.com/markets/news.rss", "bloomberg"),
    ("https://www.sciencedaily.com/rss/all.xml", "sciencedaily"),
    ("https://www.space.com/feeds/all", "space"),
    ("https://www.newscientist.com/feed/home", "newscientist"),
    ("https://www.espn.com/espn/rss/news", "espn"),
    ("https://www.skysports.com/rss/12040", "skysports"),
    ("https://deadline.com/feed/", "deadline"),
    # Round 3 2026-06-24
    ("https://www.semafor.com/rss.xml", "semafor"),
    ("https://www.latimes.com/world-nation/rss2.0.xml", "latimes"),
    ("https://www.livescience.com/feeds/all", "livescience"),
    ("https://www.cbsnews.com/latest/rss/main", "cbs"),
    ("https://abcnews.go.com/abcnews/topstories", "abc"),
    ("https://www.technologyreview.com/feed/", "mit-tr"),
    ("https://venturebeat.com/feed/", "venturebeat"),
    ("https://www.billboard.com/feed/", "billboard"),
    ("https://www.rollingstone.com/feed/", "rollingstone"),
    ("https://pitchfork.com/feed/", "pitchfork"),
    ("https://www.nme.com/feed", "nme"),
    ("https://variety.com/feed/", "variety"),
    ("https://www.hollywoodreporter.com/feed/", "hollywoodreporter"),
]


async def _fetch_rss(url: str, label: str, count: int = 15) -> list[dict]:
    """Fetch headlines from a standard RSS/Atom feed."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as c:
            r = await c.get(url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; ElarisBot/1.0)"})
            if r.status_code != 200:
                return []
            import xml.etree.ElementTree as ET
            root = ET.fromstring(r.text)
            items = []
            for el in root.findall('.//item')[:count]:
                title_el = el.find('title')
                link_el = el.find('link')
                title = (title_el.text or "").strip() if title_el is not None else ""
                link = (link_el.text or "").strip() if link_el is not None else ""
                if not title or not link:
                    continue
                items.append({
                    "title": title,
                    "url": link,
                    "score": "",
                    "source": f"rss-{label}",
                })
            return items
    except Exception as e:
        print(f"[news_sync] RSS[{label}] error: {e}", flush=True)
        return []


async def _fetch_google_news(query: str, region: str = "us", count: int = 15) -> list[dict]:
    """Fetch headlines from Google News RSS search. Free, no API key.

    RSS endpoint: https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en
    Returns items formatted like NewsNow: {title, url, source, score}.
    """
    try:
        url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as c:
            r = await c.get(url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; ElarisBot/1.0)"})
            if r.status_code != 200:
                return []
            import xml.etree.ElementTree as ET
            root = ET.fromstring(r.text)
            items = []
            for el in root.findall('.//item')[:count]:
                title_el = el.find('title')
                link_el = el.find('link')
                source_el = el.find('source')
                title = (title_el.text or "").strip() if title_el is not None else ""
                link = (link_el.text or "").strip() if link_el is not None else ""
                source_name = (source_el.text or "").strip() if source_el is not None else ""
                if not title or not link:
                    continue
                items.append({
                    "title": title,
                    "url": link,
                    "score": "",
                    "source": f"google-news-{source_name[:12]}" if source_name else "google-news",
                })
            return items
    except Exception as e:
        print(f"[news_sync] GoogleNews[{query[:30]}] error: {e}", flush=True)
        return []


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

    # Also pull from Google News RSS (free EN source) for broader EN coverage
    for query, region in GOOGLE_NEWS_QUERIES:
        all_tasks.append(_fetch_google_news(query, region, count=15))
        all_labels.append(("en", f"google:{query[:20]}"))

    # Also pull from free EN RSS feeds (BBC, NYT, NPR, Guardian)
    for url, label in EN_RSS_FEEDS:
        all_tasks.append(_fetch_rss(url, label, count=15))
        all_labels.append(("en", f"rss:{label}"))

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
            # Google News items already have their source set; NewsNow items get sid
            if "source" not in it or it["source"] == sid:
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
    """Pull a ~2000-char summary from a v2/v3 soul dict.

    Tries V3 narrative_insight_cards first, then expands V2 schema fields
    (identity, expertise, relationships, etc.) so keyword extraction has
    enough signal.
    """
    parts = []
    # v3: 5-7 narrative insight cards
    if "narrative_insight_cards" in soul_data:
        for card in soul_data["narrative_insight_cards"][:5]:
            if isinstance(card, dict):
                t = card.get("title") or card.get("card_title") or ""
                b = card.get("body") or card.get("text") or card.get("content") or ""
                if t:
                    parts.append(f"## {t}\n{b[:300]}")
    # v2: identity (always include — has name, title, background, industry)
    if "identity" in soul_data:
        ident = soul_data["identity"]
        if isinstance(ident, dict):
            for k in ("name", "title", "company", "background",
                      "one_line_summary", "identity_summary", "role", "industry"):
                v = ident.get(k)
                if v:
                    parts.append(f"identity.{k}: {v}")
    # v2: expertise (very valuable — these are basically keywords already)
    if "expertise" in soul_data:
        exp = soul_data["expertise"]
        if isinstance(exp, dict):
            for k in ("domains", "core_skills", "signature_topics",
                      "skills", "tools", "topics"):
                v = exp.get(k)
                if isinstance(v, list):
                    parts.append(f"expertise.{k}: {', '.join(str(x) for x in v[:10])}")
                elif v:
                    parts.append(f"expertise.{k}: {v}")
    # v2: cognitive architecture
    if "cognitive_architecture" in soul_data:
        ca = soul_data["cognitive_architecture"]
        if isinstance(ca, dict):
            for k in ("core_thinking_pattern", "intellectual_style", "decision_framework"):
                v = ca.get(k)
                if v:
                    parts.append(f"cog_arch.{k}: {v[:300]}")
    # v2: relationships (peers, collaborators, subjects of interest)
    if "relationships" in soul_data:
        rel = soul_data["relationships"]
        if isinstance(rel, dict):
            for k in ("peers", "collaborators", "mentors", "key_figures",
                      "subjects_of_interest", "rivals"):
                v = rel.get(k)
                if isinstance(v, list):
                    parts.append(f"relationships.{k}: {', '.join(str(x) for x in v[:8])}")
                elif v:
                    parts.append(f"relationships.{k}: {v}")
    # v2: turning_points + peak_moment + evolution + legacy (rich context)
    for big_field in ("turning_points", "peak_moment", "evolution", "legacy"):
        if big_field in soul_data and isinstance(soul_data[big_field], (str, list, dict)):
            v = soul_data[big_field]
            if isinstance(v, str):
                parts.append(f"{big_field}: {v[:200]}")
            elif isinstance(v, list):
                parts.append(f"{big_field}: {' | '.join(str(x)[:100] for x in v[:3])}")
            elif isinstance(v, dict):
                parts.append(f"{big_field}: {json.dumps(v, ensure_ascii=False)[:200]}")
    # Fallback: stringify first 1500 chars
    if not parts:
        return json.dumps(soul_data, ensure_ascii=False)[:1500]
    return "\n".join(parts)[:2000]


def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode("utf-8")).hexdigest()


# ── Persona picks & digests ──────────────────────────────────

PICK_PROMPT = """You are {persona_name}, browsing today's trending news.

Your personality and voice:
{soul_excerpt}

Below is today's hot list (already pre-filtered to news that MIGHT be relevant to your field).
Pick 1-3 headlines that you, {persona_name}, would genuinely want to comment on.

HOT LIST:
{hot_list}

STRICT RULES — be selective but not impossible:
1. Pick headlines where you would have a GENUINE, UNIQUE angle as {persona_name}:
   - ✅ OK: News mentioning your company, your collaborators, your competitors, your direct peers
   - ✅ OK: A topic you are KNOWN to have opinions about (concert pricing, AI in music, your industry trends)
   - ✅ OK: A news event that meaningfully affects your field, your audience, or your work
   - ✅ OK: Tech/business/society news that you'd naturally react to as a public figure
   - ⚠️ MAYBE OK: News about a peer or adjacent celebrity — only if you have a real angle, not just "we're both in entertainment"
   - ❌ NOT OK: Random gossip, generic celebrity news, clickbait that doesn't involve you
2. Don't be too restrictive — if you have even a loose angle on something that's been trending, it's fine to comment.
3. Pick at least 1 if you can find anything reasonable. If nothing interests you at all today, return empty.
4. Only return the index numbers — we'll fetch the full article text for you next.

CRITICAL OUTPUT FORMAT:
Your response MUST be EXACTLY one JSON object, NOTHING ELSE.
Do NOT include any thinking, reasoning, explanation, or commentary.
Start your response with '{{' and end with '}}'.

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

CRITICAL OUTPUT FORMAT:
Your response MUST be EXACTLY one JSON object, NOTHING ELSE.
Do NOT include any thinking, reasoning, explanation, or commentary.
Start your response with '{{' and end with '}}'.

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

CRITICAL OUTPUT FORMAT:
Your response MUST be EXACTLY one JSON object, NOTHING ELSE.
Do NOT include any thinking, reasoning, explanation, or commentary.
Start your response with '{{' and end with '}}'.
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

CRITICAL OUTPUT FORMAT:
Your response MUST be EXACTLY one JSON object, NOTHING ELSE.
Do NOT include any thinking, reasoning, explanation, or commentary.
Start your response with '{{' and end with '}}'.
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
    # Normalize lang: "zh-CN" / "zh-TW" / "zh" all collapse to "zh"
    norm_lang = "zh" if lang and lang.lower().startswith("zh") else "en"
    lang_label = "Chinese" if norm_lang == "zh" else "English"
    cache_key = f"{persona_name}:{norm_lang}"
    now = time.time()

    # Cache hit?
    if cache_key in _FACTS_CACHE:
        cached_facts, ts = _FACTS_CACHE[cache_key]
        if now - ts < _FACTS_TTL_SECONDS:
            return cached_facts
        else:
            del _FACTS_CACHE[cache_key]

    # Step A: LLM generates 2 search queries (json_mode=True + brace extraction)
    queries: list[str] = []
    for attempt in (1,):  # single attempt: if it fails, we go without facts
        try:
            qprompt = FACT_QUERY_PROMPT.format(
                persona_name=persona_name,
                description=(description or persona_name)[:300],
                lang_label=lang_label,
            )
            qtext = await minimax_client.chat(
                [
                    {"role": "system", "content": "You output ONLY valid JSON."},
                    {"role": "user", "content": qprompt},
                ],
                temperature=0.5,
                max_tokens=200,
                json_mode=True,
            )
            qtext = (qtext or "").strip()
            if not qtext:
                raise ValueError("empty LLM response")
            if chr(96) * 3 in qtext:
                parts = qtext.split(chr(96) * 3)
                for j in range(1, len(parts), 2):
                    cand = parts[j]
                    if cand.startswith("json"):
                        cand = cand[4:]
                    cand = cand.strip()
                    if cand.startswith("{"):
                        qtext = cand
                        break
                else:
                    qtext = parts[-1].strip()
            if not qtext.startswith("{"):
                b1 = qtext.find("{")
                if b1 >= 0:
                    b2 = qtext.rfind("}")
                    if b2 > b1:
                        qtext = qtext[b1:b2 + 1]
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

    # Step C: LLM extracts 3-5 facts (json_mode=True + brace extraction)
    facts: list[str] = []
    for attempt in (1,):  # single attempt: 24h cache means >90% hit rate
        try:
            eprompt = FACT_EXTRACT_PROMPT.format(
                persona_name=persona_name,
                results_block=results_block,
                lang_label=lang_label,
            )
            etext = await minimax_client.chat(
                [
                    {"role": "system", "content": "You output ONLY valid JSON. Respond in " + lang_label + "."},
                    {"role": "user", "content": eprompt},
                ],
                temperature=0.3,
                max_tokens=500,
                json_mode=True,
            )
            etext = (etext or "").strip()
            if not etext:
                raise ValueError("empty LLM response")
            if chr(96) * 3 in etext:
                parts = etext.split(chr(96) * 3)
                for j in range(1, len(parts), 2):
                    cand = parts[j]
                    if cand.startswith("json"):
                        cand = cand[4:]
                    cand = cand.strip()
                    if cand.startswith("{"):
                        etext = cand
                        break
                else:
                    etext = parts[-1].strip()
            if not etext.startswith("{"):
                b1 = etext.find("{")
                if b1 >= 0:
                    b2 = etext.rfind("}")
                    if b2 > b1:
                        etext = etext[b1:b2 + 1]
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
    # Normalize lang defensively (run_sync already normalizes, but be safe)
    norm_lang = "zh" if lang and lang.lower().startswith("zh") else "en"
    lang_label = "Chinese" if norm_lang == "zh" else "English"

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

    # ── Step 0.5: Persona industry keywords (hardcoded category library) ──
    # Map persona to categories → keywords. This replaces the previous LLM-
    # extracted keywords, which were unreliable (DeepSeek reasoning model
    # would emit thinking blocks and fail to parse).
    categories = get_categories_for_persona(persona_name)
    keywords = get_keywords_for_categories(categories)
    print(f"[news_sync] {persona_name} ({lang}) categories={categories}, kw_count={len(keywords)}", flush=True)

    # ── Step 1: Pre-filter hot list by hardcoded keywords ──
    # Now this WORKS (vs LLM-extracted keywords which mostly missed proper-
    # noun titles like "陆虎为白鹿写歌"). Keep all matching items, then cap
    # at top 30 by source diversity for LLM processing.
    filtered = [
        (i, item) for i, item in enumerate(hot_list)
        if news_matches_categories(item, keywords, persona_name)
    ]
    print(f"[news_sync] {persona_name}: hot-list filter {len(hot_list)} -> {len(filtered)}", flush=True)

    # If filter produced nothing, fallback to top 30 so persona isn't completely silent
    if len(filtered) == 0:
        print(f"[news_sync] {persona_name}: no category-matched news, relaxing to top 15", flush=True)
        fallback = list(enumerate(hot_list[:15]))
        hot_list_for_pick = [item for _, item in fallback]
        remap = [i for i, _ in fallback]
    else:
        # Cap at 12 by source diversity (was 30): cron runs hourly, 34 personas
        # must finish in <60min. 12 candidates is plenty for 1-3 picks. Shorter
        # prompt = faster LLM = fewer reasoning-block parse failures.
        top_n = 12
        by_src: dict[str, list[int]] = {}
        for orig_i, item in filtered:
            by_src.setdefault(item.get("source", "?"), []).append(orig_i)
        interleaved_indices: list[int] = []
        sources = list(by_src.keys())
        idx_per_src = [0] * len(sources)
        while len(interleaved_indices) < top_n and any(idx_per_src[s] < len(by_src[sources[s]]) for s in range(len(sources))):
            for s, src in enumerate(sources):
                if idx_per_src[s] < len(by_src[src]):
                    interleaved_indices.append(by_src[src][idx_per_src[s]])
                    idx_per_src[s] += 1
                    if len(interleaved_indices) >= top_n:
                        break
        hot_list_for_pick = [hot_list[i] for i in interleaved_indices]
        remap = interleaved_indices

    # ── Step 2: LLM picks headlines from filtered list ──
    lines = [f"{i}. [{item['source']}] {item['title']}" for i, item in enumerate(hot_list_for_pick)]
    pick_prompt = PICK_PROMPT.format(
        persona_name=persona_name,
        soul_excerpt=soul_excerpt,
        hot_list="\n".join(lines),
    )

    try:
        # json_mode=True forces valid JSON output from DeepSeek.
        # But reasoning models sometimes still emit thinking blocks even with
        # json_mode — retry up to 3 times with stronger prompts.
        data = None
        last_text = ""  # saved for debug logging on failure
        user_msg = pick_prompt  # used as-is for attempt 1, replaced for attempt 2
        for pick_attempt in (1, 2):
            if pick_attempt == 1:
                sys_msg = "You output ONLY valid JSON."
            else:
                # 2nd attempt: ultra-short prompt, NO json_mode (conflicts with system prompt)
                sys_msg = "Pick 1-2 headline indices from the list. Output ONLY the JSON."
                user_msg = f"Pick 1-2 headlines for {persona_name}:\n" + "\n".join(lines[:10])
            text = await minimax_client.chat(
                [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.5 if pick_attempt == 1 else 0.0,
                max_tokens=400,
                json_mode=(pick_attempt == 1),  # no json_mode on 2nd: conflicts with prompt
            )
            text = (text or "").strip()
            last_text = text
            # Strip ```json ... ``` wrapper if present
            if chr(96) * 3 in text:
                parts = text.split(chr(96) * 3)
                for j in range(1, len(parts), 2):
                    cand = parts[j]
                    if cand.startswith("json"):
                        cand = cand[4:]
                    cand = cand.strip()
                    if cand.startswith("{"):
                        text = cand
                        break
                else:
                    text = parts[-1].strip()
            if not text.startswith("{"):
                b1 = text.find("{")
                if b1 >= 0:
                    b2 = text.rfind("}")
                    if b2 > b1:
                        text = text[b1:b2 + 1]
            try:
                data = json.loads(text)
                # Handle both {"picks":[...]} and [...] (LLM sometimes returns array directly)
                if isinstance(data, list):
                    raw_indices = [int(p["index"]) if isinstance(p, dict) else int(p) for p in data]
                else:
                    raw_indices = [p.get("index", -1) for p in data.get("picks", [])]
                break
            except Exception:
                if pick_attempt == 2:
                    raise
                continue
        raw_indices = [p.get("index", -1) for p in data.get("picks", [])]
        raw_indices = [i for i in raw_indices if 0 <= i < len(hot_list_for_pick)]
        # Remap back to original hot_list indices
        indices = [remap[i] for i in raw_indices if 0 <= i < len(remap)]
    except Exception as e:
        # Distinguish causes: empty_response / no_json_still_reasoning / parse_error
        t = (last_text or "").strip()[:80]
        if not t:
            kind = "empty_response"
        elif '{' not in t:
            kind = "no_json_still_reasoning"
        else:
            kind = "parse_error"
        print(f"[news_sync] pick failed for {persona_name}: {kind} ({e}) last_text={t!r}", flush=True)
        return []

    if not indices:
        return []

    # ── Step 1.5: Post-filter (soft) — log warnings on borderline picks ──
    # We do NOT drop picks here because hot-list titles are mostly proper-noun
    # events ("陆虎为白鹿写歌", "雷军考虑复活YU7") that don't contain our
    # category keywords ("歌手", "娱乐"). The hardened PICK_PROMPT now asks
    # the LLM to only pick items genuinely about the persona; we trust that
    # and only log for observability.
    if keywords:
        borderline = []
        for idx in indices:
            item = hot_list[idx]
            if not news_matches_categories(item, keywords, persona_name):
                borderline.append(item.get("title", "?"))
        if borderline:
            print(f"[news_sync] {persona_name}: post-filter soft-warning {len(borderline)}: {borderline[:2]}", flush=True)

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
            # json_mode=True forces valid JSON. Retry up to 3 times on parse fail.
            data = None
            for digest_attempt in (1, 2):
                if digest_attempt == 1:
                    sys_msg = "You output ONLY valid JSON. Respond in " + lang_label + "."
                else:
                    sys_msg = "CRITICAL: Output ONLY a JSON object. NO thinking. Respond in " + lang_label + "."
                text = await minimax_client.chat(
                    [
                        {"role": "system", "content": sys_msg},
                        {"role": "user", "content": digest_prompt},
                    ],
                    temperature=0.7 if digest_attempt == 1 else 0.0,
                    max_tokens=600,
                    json_mode=True,
                )
                text = (text or "").strip()
                if chr(96) * 3 in text:
                    parts = text.split(chr(96) * 3)
                    for j in range(1, len(parts), 2):
                        cand = parts[j]
                        if cand.startswith("json"):
                            cand = cand[4:]
                        cand = cand.strip()
                        if cand.startswith("{"):
                            text = cand
                            break
                    else:
                        text = parts[-1].strip()
                if not text.startswith("{"):
                    b1 = text.find("{")
                    if b1 >= 0:
                        b2 = text.rfind("}")
                        if b2 > b1:
                            text = text[b1:b2 + 1]
                try:
                    data = json.loads(text)
                    break
                except Exception:
                    if digest_attempt == 2:
                        raise
                    continue
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
            print(f"[news_sync] {persona.name}: no hot list for {lang_key}, skipping", flush=True)
            continue

        # LLM picks + digests
        picks = await persona_picks(
            persona.name, soul_data, hot_list, lang_key,
            description=persona.description or "",
        )
        # Fallback: if EN soul produced 0 picks (e.g. 周杰伦 English soul
        # against hackernews-only hot list), try ZH hot list.
        if not picks and lang_key == "en" and hot.get("zh"):
            print(f"[news_sync] {persona.name}: no picks from EN hot list, trying ZH", flush=True)
            picks = await persona_picks(
                persona.name, soul_data, hot["zh"], "zh",
                description=persona.description or "",
            )
            lang_key = "zh"  # so source_lang below reflects actual source

        if not picks:
            print(f"[news_sync] {persona.name}: 0 picks, skipping", flush=True)
            skipped += 1
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
                        source_lang=lang_key,
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
                    source_lang=lang_key,
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
