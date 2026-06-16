"""Elaris Search Pipeline: SearXNG (primary) + Obscura browser (fallback).

2026-06-16 final: Two-layer architecture.
  Layer 1 — SearXNG (bing+sogou+360+so, 0.4s): handles 90%+ of queries.
  Layer 2 — Obscura (Sogou→Baidu, ~7-10s): kicks in when SearXNG returns 0.

Why this shape:
  - SearXNG is fast and reliable for English and general Chinese queries,
    but misses fresh Chinese entertainment/news that never hits Bing's index.
  - Obscura's real V8 browser gets results from Sogou/Baidu that SearXNG
    can't, but CAPTCHA/antispider limits it to ~10-20 queries per engine
    before blocking.  Using it only as a fallback keeps volume low enough
    that engines don't blacklist the IP.
  - Together: SearXNG covers the fast path.  Obscura fills the blind spots.
"""

import asyncio
import json
import logging
import subprocess
from datetime import datetime, timedelta
from urllib.parse import quote_plus

logger = logging.getLogger("uvicorn")

# ── SearXNG (Layer 1) ──────────────────────────────────────────

SEARXNG_URL = "http://localhost:8888/search"
SEARXNG_ENGINES = "bing,sogou,360search,so"
SEARXNG_TIMEOUT = 15.0
MAX_RESULTS = 8

_empty_streak = 0
_last_empty_warn = None


def _record_empty():
    global _empty_streak, _last_empty_warn
    _empty_streak += 1
    now = datetime.now()
    if _last_empty_warn is None or (now - _last_empty_warn) > timedelta(minutes=5):
        logger.warning(f"[SEARCH_HEALTH] empty streak={_empty_streak}")
        _last_empty_warn = now


def _record_success(n: int):
    global _empty_streak
    if _empty_streak > 0:
        logger.info(f"[SEARCH_HEALTH] recovered after {_empty_streak} empties")
    _empty_streak = 0


async def _searxng_search(query: str, time_range: str = "", categories: str = "", _retries: int = 0) -> list[dict]:
    import httpx
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5,zh;q=0.5",
        }
        params = {"q": query, "format": "json", "pageno": 1, "engines": SEARXNG_ENGINES}
        if time_range:
            params["time_range"] = time_range
        if categories:
            params["categories"] = categories
        async with httpx.AsyncClient(timeout=SEARXNG_TIMEOUT) as client:
            resp = await client.get(SEARXNG_URL, params=params, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"[SearXNG] HTTP {resp.status_code} for: {query[:60]}")
                return []
            data = resp.json()
            results = []
            for r in data.get("results", [])[:MAX_RESULTS]:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                    "source": "searxng",
                    "score": r.get("score", 0.8),
                })
            if results:
                _record_success(len(results))
                logger.info(f"[SearXNG] {len(results)} results for: {query[:60]}")
            return results
    except asyncio.TimeoutError:
        logger.warning(f"[SearXNG] Timeout for: {query[:60]}")
        return []
    except Exception as e:
        logger.warning(f"[SearXNG] Failed for '{query[:60]}': {e}")
        return []


# ── Obscura (Layer 2 — fallback) ───────────────────────────────

OBSCURA_BIN = "/tmp/obscura/target/release/obscura"

_BAIDU_EVAL = (
    "(function(){"
    "var r=document.querySelectorAll('.result,.c-container');"
    "return Array.from(r).slice(0,8).map(function(e){"
    "var a=e.querySelector('a');"
    "var t=e.querySelector('h3,.t,.c-title');"
    "var s=e.querySelector('.c-abstract,.c-span-last');"
    "return {title:(t||a||{}).textContent||'',url:(a||{}).href||'',snippet:(s||{}).textContent||''};"
    "});"
    "})()"
)

_SOGOU_EVAL = (
    "(function(){"
    "var r=document.querySelectorAll('.vrwrap,.rb');"
    "return Array.from(r).slice(0,8).map(function(e){"
    "var a=e.querySelector('h3.vrTitle a,.vr-title a,a.title');"
    "var p=e.querySelector('.star-wiki,.str_info,.space-txt,.fb');"
    "return {title:(a||{}).textContent||'',url:(a||{}).href||'',snippet:(p||{}).textContent||''};"
    "}).filter(function(x){return x.title;});"
    "})()"
)

_BING_EVAL = (
    "(function(){"
    "var r=document.querySelectorAll('li.b_algo');"
    "return Array.from(r).slice(0,8).map(function(e){"
    "var a=e.querySelector('h2 a');"
    "var p=e.querySelector('.b_caption p,.b_snippet');"
    "return {title:(a||{}).textContent||'',url:(a||{}).href||'',snippet:(p||{}).textContent||''};"
    "});"
    "})()"
)


async def _obscura_fetch(url: str, eval_js: str, timeout: int = 15) -> list[dict]:
    try:
        proc = await asyncio.create_subprocess_exec(
            OBSCURA_BIN, "fetch", url,
            "--stealth",
            "--eval", eval_js,
            "--wait-until", "load",
            "--allow-private-network",
            "--timeout", str(timeout),
            "-q",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout + 5)
        raw = stdout.decode("utf-8", errors="replace").strip()
        if not raw:
            return []
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return []
        results = []
        for r in parsed:
            if not isinstance(r, dict):
                continue
            title = (r.get("title") or "").strip()
            if not title or len(title) < 2:
                continue
            url_val = (r.get("url") or "").strip()
            snippet = (r.get("snippet") or "").strip()
            if not url_val:
                continue
            results.append({
                "title": title[:120],
                "url": url_val,
                "snippet": snippet[:300],
                "source": "obscura",
                "score": 0.7,
            })
        if results:
            logger.info(f"[Obscura] {len(results)} results from {url[:60]}")
        return results
    except asyncio.TimeoutError:
        logger.warning(f"[Obscura] Timeout: {url[:60]}")
        return []
    except json.JSONDecodeError:
        return []
    except Exception as e:
        logger.warning(f"[Obscura] Failed: {e}")
        return []


async def _obscura_search(query: str) -> list[dict]:
    """CN: Sogou → Baidu.  EN: Bing."""
    has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in query)
    if has_cjk:
        # Sogou (best CN results, may antispider → fall through)
        r = await _obscura_fetch(
            f"https://www.sogou.com/web?query={quote_plus(query)}", _SOGOU_EVAL)
        if r:
            return r
        # Baidu (great results, CAPTCHA after ~20 queries)
        return await _obscura_fetch(
            f"https://www.baidu.com/s?wd={quote_plus(query)}", _BAIDU_EVAL)
    else:
        return await _obscura_fetch(
            f"https://www.bing.com/search?q={quote_plus(query)}", _BING_EVAL)


# ── Unified search (Layer 1 → Layer 2) ────────────────────────

async def _search_one(query: str, time_range: str = "", categories: str = "") -> list[dict]:
    """SearXNG first; if empty or results don't match query keywords, fall back to Obscura."""
    results = await _searxng_search(query, time_range=time_range, categories=categories)
    if results:
        # Relevance check: if user asked about a specific topic (e.g. 南京演唱会)
        # but SearXNG only returned generic persona pages (周杰伦百度百科),
        # the results are effectively useless. Check if any result's title or
        # snippet contains query keywords.
        has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in query)
        if has_cjk:
            # Extract 2+ char CJK segments, but exclude the persona name
            # (the first 2-3 CJK chars are usually the persona name, which
            # always matches SearXNG results about "who is X" — useless signal)
            import re as _re_kw
            _kw_candidates = _re_kw.findall(r'[\u4e00-\u9fff]{2,}', query)
            # Skip the first CJK segment (the persona name)
            _topical_kw = [k for k in _kw_candidates[1:] if len(k) >= 2]
            _kw_set = set(_topical_kw[:6])
            if _kw_set:
                _matched = False
                for r in results[:5]:
                    _txt = (r.get('title','') + ' ' + r.get('snippet',''))
                    for kw in _kw_set:
                        if kw in _txt:
                            _matched = True
                            break
                    if _matched:
                        break
                if not _matched:
                    logger.info(f"[RELEVANCE] SearXNG results don't match keywords {_kw_set}, falling back to Obscura")
                    # Obscura results FIRST (they contain what the user actually asked)
                    return await _obscura_search(query) + results
        return results
    logger.info(f"[FALLBACK] SearXNG empty for '{query[:50]}', trying Obscura")
    return await _obscura_search(query)


# ── Time-sensitive heuristic ───────────────────────────────────

_TIME_KEYWORDS_ZH = [
    "今天", "今晚", "昨晚", "刚刚", "刚才", "最新", "近期", "最近",
    "这周", "本周", "昨天", "前天", "上周", "今日", "刚出", "刚发",
    "刚刚发生", "今天刚", "刚发生", "刚公布", "刚签", "刚释出",
    "新闻", "动态", "进展", "更新", "现场", "正在",
    "2026", "2025",
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
    q = query.lower()
    has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in query)
    keywords = _TIME_KEYWORDS_ZH if has_cjk else _TIME_KEYWORDS_EN
    for kw in keywords:
        if kw in query or kw.lower() in q:
            return True
    return False


# ── Public API ─────────────────────────────────────────────────

async def search_web(queries: list[str], force_time_sensitive: bool = False) -> list[dict]:
    if not queries:
        return []
    tasks = []
    meta = []
    for qi, q in enumerate(queries):
        tasks.append(asyncio.create_task(_search_one(q)))
        meta.append((qi, "web"))
    raw = await asyncio.gather(*tasks, return_exceptions=True)
    out = {qi: {"results": [], "seen_urls": set(), "modes": set()} for qi in range(len(queries))}
    for (qi, mode), r in zip(meta, raw):
        if not isinstance(r, list):
            continue
        for hit in r:
            url = hit.get("url", "")
            if not url or url in out[qi]["seen_urls"]:
                continue
            out[qi]["seen_urls"].add(url)
            hit = dict(hit)
            if "source" not in hit:
                hit["source"] = "web"
            out[qi]["results"].append(hit)
        if r:
            out[qi]["modes"].add(mode)
    return [
        {
            "query": queries[qi],
            "results": out[qi]["results"][:MAX_RESULTS * 2],
            "modes": list(out[qi]["modes"]),
        }
        for qi in range(len(queries))
    ]


async def scrape_top_results(results: list[dict], max_pages: int = 3) -> str:
    from trafilatura import extract
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


async def ensure_web_search_results(persona_id: str, db) -> None:
    import uuid
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
