"""Elaris Search Pipeline: SearXNG multi-engine with health tracking.

Reliability fix (2026-06-16):
- SearXNG was down for 23h+ because Bing engine was rate-limited (suspended_time=180),
  and the pipeline returned 0 results with no fallback. Total blackout.
- Now: 5-engine SearXNG (bing/brave/startpage/duckduckgo/google) — if one
  engine is suspended, others still return results.
- Health check on every call: if SearXNG returns 0 results consecutively,
  log a warning so operators see the outage in real time.
- DDG HTML fallback removed: in this server's network, html.duckduckgo.com
  is unreachable. Multi-engine SearXNG is the reliable path.
- chat.py emits a `search_status` event to the frontend when search is empty,
  so the user sees "search service temporarily unavailable" instead of
  the persona falsely saying "I don't know".
"""

import asyncio
import logging
from datetime import datetime, timedelta
from trafilatura import extract

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://localhost:8888/search"
# Brave + DuckDuckGo engines are NOT used:
#   - Brave: 429 suspended every 3min (rate limited from this IP)
#   - DuckDuckGo (html.duckduckgo.com): connect timeout (firewalled)
#   - Bing: solid for both EN and ZH
#   - Google: solid for EN, weak for ZH but Bing covers it
#   - Startpage: solid backup
# baidu added 2026-06-16: Baidu News has fresher Chinese news than Bing
# (returns '美伊达成和平协议,6月19日签署' on Trump+Iran+19 query where
# Bing/Google returned nothing).
# - Brave: 429 suspended every 3min
# - DuckDuckGo: ConnectTimeout (firewalled)
# - Bing: solid for EN+ZH web, weak for fresh Chinese news
# - Google: solid for EN
# - Startpage: solid backup
# - Baidu: solid for Chinese news (时效性比 Bing 中文好)
SEARXNG_ENGINES = "bing,google,startpage,baidu"
SEARXNG_TIMEOUT = 15.0
MAX_RESULTS = 8

# Track consecutive empty responses so we can log a louder warning
_empty_streak = 0
_last_empty_warn = None


def _record_empty():
    global _empty_streak, _last_empty_warn
    _empty_streak += 1
    now = datetime.now()
    # Only log loudly if we haven't warned in the last 5 minutes
    if _last_empty_warn is None or (now - _last_empty_warn) > timedelta(minutes=5):
        logger.warning(f"[SEARCH_HEALTH] SearXNG returned 0 results "
                       f"(streak={_empty_streak}). If streak > 3, check SearXNG "
                       f"engines: docker logs searxng | grep -i suspended")
        _last_empty_warn = now


def _record_success(n: int):
    global _empty_streak
    if _empty_streak > 0:
        logger.info(f"[SEARCH_HEALTH] Recovered after {_empty_streak} empty calls")
    _empty_streak = 0


async def _searxng_search(query: str, time_range: str = "", categories: str = "", _retries: int = 0) -> list[dict]:
    import httpx
    try:
        # NOTE: do NOT pass language=auto — it returns 0 for non-ASCII queries.
        # SearXNG default is "all" which works for both Chinese and English.
        params = {
            "q": query, "format": "json",
            "pageno": 1, "engines": SEARXNG_ENGINES,
        }
        if time_range:
            params["time_range"] = time_range  # day|week|month|year
        if categories:
            params["categories"] = categories   # news|general|images...
        async with httpx.AsyncClient(timeout=SEARXNG_TIMEOUT) as client:
            resp = await client.get(SEARXNG_URL, params=params)
            if resp.status_code != 200:
                logger.warning(f"[SearXNG] HTTP {resp.status_code} for: {query[:60]}")
                _record_empty()
                return []
            data = resp.json()
            results = []
            for r in data.get("results", [])[:MAX_RESULTS]:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                    "engines": r.get("engines", ["searxng"]),
                    "score": r.get("score", 0.8),
                    "source": "searxng",
                })
            if results:
                _record_success(len(results))
                logger.info(f"[SearXNG] {len(results)} results for: {query[:60]}")
                return results
            else:
                _record_empty()
                # Bing News engine intermittently returns 0 with "Document is
                # empty" internal error. Retry up to 2 times before giving up.
                if categories == "news" and _retries < 2:
                    logger.info(f"[SearXNG] News mode empty, retry {_retries+1}/2: {query[:50]}")
                    await asyncio.sleep(0.5 * (_retries + 1))
                    return await _searxng_search(query, time_range=time_range, categories=categories, _retries=_retries+1)
                return []
    except asyncio.TimeoutError:
        logger.warning(f"[SearXNG] Timeout for: {query[:60]}")
        _record_empty()
        return []
    except Exception as e:
        logger.warning(f"[SearXNG] Failed for '{query[:60]}': {e}")
        _record_empty()
        return []


async def _search_one(query: str, time_range: str = "", categories: str = "") -> list[dict]:
    return await _searxng_search(query, time_range=time_range, categories=categories)


# Time-sensitive keywords (zh + en) that suggest the user wants recent news
_TIME_KEYWORDS_ZH = [
    "今天", "今天早上", "今晚", "昨晚", "刚刚", "刚才", "最新", "近期", "最近",
    "这周", "本周", "昨天", "前天", "上周", "今日", "刚出", "刚发", "刚发佈",
    "刚刚发生", "今天刚", "刚发生", "刚公布", "刚签", "刚释出",
    "新闻", "动态", "进展", "更新", "现场", "正在",
    "2026", "2025",  # year mentions imply recency
    "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月",
    "一号", "二号", "三号", "四号", "五号", "六号", "七号", "八号", "九号", "十号",
    "11号", "12号", "13号", "14号", "15号", "16号", "17号", "18号", "19号", "20号",
    "21号", "22号", "23号", "24号", "25号", "26号", "27号", "28号", "29号", "30号", "31号",
]
_TIME_KEYWORDS_EN = [
    "today", "tonight", "yesterday", "just now", "just in", "latest", "recent",
    "this week", "last week", "breaking", "news", "update", "new", "live",
    "signed", "happened", "announced", "released", "launched", "out now",
    str(datetime.now().year), str(datetime.now().year - 1),
]


def _is_time_sensitive(query: str) -> bool:
    """Heuristic: does this query look like it needs fresh news?"""
    q = query.lower()
    has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in query)
    keywords = _TIME_KEYWORDS_ZH if has_cjk else _TIME_KEYWORDS_EN
    for kw in keywords:
        if kw in query or kw.lower() in q:
            return True
    return False


async def search_web(queries: list[str], force_time_sensitive: bool = False) -> list[dict]:
    """Run multiple search queries in parallel with mode-aware dual-track.

    For each query:
      - if it's time-sensitive AND in English: also do a News-mode parallel search
        (time_range=week, categories=news) and merge results
      - if it's in Chinese: do NOT add News mode (SearXNG CN + time_range = 0 results)

    Results from all modes are deduped by URL, source tag includes mode.
    Returns a list of {query, results, modes} per input query.
    """
    if not queries:
        return []
    tasks = []
    meta = []  # parallel to tasks: (query_idx, mode_label)
    for qi, q in enumerate(queries):
        # Track 1: regular web
        tasks.append(asyncio.create_task(_search_one(q)))
        meta.append((qi, "web"))
        # Track 2: News mode (only for English-dominant + time-sensitive)
        # CJK + time_range doesn't work in SearXNG (returns 0 results).
        # But English with time_range+categories=news works great.
        is_ts = force_time_sensitive or _is_time_sensitive(q)
        cjk_count = sum(1 for ch in q if '\u4e00' <= ch <= '\u9fff')
        total_chars = len([c for c in q if not c.isspace()])
        cjk_ratio = cjk_count / total_chars if total_chars else 0
        # If query is mostly ASCII (CJK < 40% of chars), try News mode.
        # Threshold 0.4 lets through mixed CN+EN queries like
        # "Donald Trump 跟伊朗 协议 19号签 2026" which still benefit
        # from English News mode (the CJK parts get ignored by English
        # Bing but English keywords are enough for matching).
        if is_ts and cjk_ratio < 0.4:
            tasks.append(asyncio.create_task(_search_one(q, time_range="week", categories="news")))
            meta.append((qi, "news"))
    raw = await asyncio.gather(*tasks, return_exceptions=True)
    # Bucket back by query
    out = {qi: {"results": [], "seen_urls": set(), "modes": set()} for qi in range(len(queries))}
    for (qi, mode), r in zip(meta, raw):
        if not isinstance(r, list):
            continue
        for hit in r:
            url = hit.get("url", "")
            if not url or url in out[qi]["seen_urls"] or not hit.get("snippet"):
                continue
            out[qi]["seen_urls"].add(url)
            hit = dict(hit)
            hit["source"] = f"searxng:{mode}"
            out[qi]["results"].append(hit)
        if r:
            out[qi]["modes"].add(mode)
    return [
        {
            "query": queries[qi],
            "results": out[qi]["results"][:MAX_RESULTS * 2],  # allow up to 16 after dedupe
            "modes": list(out[qi]["modes"]),
        }
        for qi in range(len(queries))
    ]


async def scrape_top_results(results: list[dict], max_pages: int = 3) -> str:
    full_texts = []
    for r in results[:max_pages]:
        try:
            url = r.get("url", "")
            if not url or any(d in url for d in ["passport.weibo", "xiaohongshu.com"]):
                continue
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(url, follow_redirects=True,
                    headers={"User-Agent": "Mozilla/5.0 ElarisSearch/1.0"})
                text = extract(resp.text)
                if text and len(text) > 200:
                    title = r.get("title", "")[:80]
                    full_texts.append(f"### {title}\n{text[:2000]}")
        except Exception:
            pass
        if len(full_texts) >= 2:
            break
    if full_texts:
        return "\n\n### Full article content (auto-scraped):\n" + "\n---\n".join(full_texts)
    return ""


# keep ensure_web_search_results for distillation
async def ensure_web_search_results(persona_id: str, db) -> None:
    import uuid, json
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.db_models import Persona, WebSearchResult

    result = await db.execute(select(WebSearchResult).where(
        WebSearchResult.persona_id == persona_id
    ).limit(1))
    if result.scalars().first():
        return

    pr = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = pr.scalar_one_or_none()
    if not persona:
        return

    search_name = persona.source_name or persona.name
    queries = [f"{search_name} {q}" for q in [
        "biography career achievements",
        "thinking style beliefs quotes",
        "personality legacy impact",
    ]]
    batch = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    for query in queries:
        results = await _search_one(query)
        for r in results[:3]:
            ws_obj = WebSearchResult(
                id=str(uuid.uuid4()), persona_id=persona_id, query=query,
                results_json=json.dumps([r], ensure_ascii=False),
                search_batch=batch, created_at=now,
            )
            db.add(ws_obj)
    await db.commit()
