"""Search aggregator: SearXNG + DuckDuckGo fallback.

- Primary: SearXNG (self-hosted aggregator, currently unreliable)
- Fallback: DuckDuckGo direct API (duckduckgo_search library)
"""
import asyncio
import logging
from typing import Optional
import httpx
from trafilatura import extract

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://127.0.0.1:8888"
TIMEOUT = 12.0
MAX_RESULTS = 15


async def _searxng_search(query: str, language: str = "auto", categories: str = None) -> list[dict]:
    """Search via local SearXNG instance with specific reliable engines."""
    # Detect if query is Chinese and use Chinese-optimized engines
    has_cn = any('\u4e00' <= c <= '\u9fff' for c in query)
    # Mojeek is the only engine that reliably works (Bing returns garbage,
    # Google/Brave/Baidu/Sogou rate-limited with 0 results)
    engines = "mojeek,duckduckgo,bing"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {"q": query, "format": "json", "language": language, "engines": engines}
            if categories:
                params["categories"] = categories
            resp = await client.get(f"{SEARXNG_URL}/search", params=params)
            if resp.status_code != 200:
                logger.warning(f"[SEARXNG] HTTP {resp.status_code} for: {query}")
                return []
            data = resp.json()
            results = []
            for r in data.get("results", []):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                    "engines": r.get("engines", []),
                    "score": r.get("score", 0),
                })
            return results
    except Exception as e:
        logger.error(f"[SEARXNG] Failed: {e}")
        return []


async def _fetch_page_content(url: str) -> Optional[str]:
    """Extract page content with trafilatura (fast, no browser)."""
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            r = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            })
            if r.status_code == 200 and r.text:
                loop = asyncio.get_event_loop()
                text = await loop.run_in_executor(
                    None, lambda: extract(r.text, url=url, include_comments=False, include_tables=False, fast=True)
                )
                return text[:1500] if text else None
    except Exception:
        pass
    return None


def _deduplicate(results: list[dict]) -> list[dict]:
    """Deduplicate by URL, keep best version."""
    seen = {}
    for r in results:
        url = r.get("url", "")
        if url and url not in seen:
            seen[url] = r
        elif url and r.get("snippet", "") and not seen[url].get("snippet", ""):
            seen[url]["snippet"] = r["snippet"]
    return list(seen.values())


def _duckduckgo_search_sync(query: str, max_results: int = 10) -> list[dict]:
    """Direct DuckDuckGo search — reliable fallback when SearXNG fails."""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                    "engines": ["duckduckgo_direct"],
                    "score": 0.5,
                })
        return results
    except Exception as e:
        logger.warning(f"[DDG] Search failed for '{query[:60]}': {e}")
        return []


async def _duckduckgo_search(query: str) -> list[dict]:
    import asyncio
    return await asyncio.to_thread(_duckduckgo_search_sync, query)


async def _noop():
    return None


async def search_web(queries: list[str]) -> list[dict]:
    """
    SearXNG search + trafilatura extraction.

    1. Fire all queries to SearXNG in parallel
    2. Deduplicate and rank by relevance
    3. Enrich results that lack snippets via trafilatura
    """
    # Parallel search — Chinese queries get dual search (zh web + en news)
    _nh = ('2024', '2025', '2026', 'latest', 'news', 'today', 'current', 'lawsuit', 'concert', 'tour')
    tasks = []
    for q in queries:
        _cjk = any('一' <= ch <= '鿿' for ch in q)
        if _cjk:
            # Chinese query: search zh web AND en news in parallel
            tasks.append(_searxng_search(q, language="zh"))
            tasks.append(_searxng_search(q, language="en", categories="news"))
        else:
            _is_news = any(hint in q.lower() for hint in _nh)
            tasks.append(_searxng_search(q, language="en", categories="news" if _is_news else None))
    all_raw = await asyncio.gather(*tasks)

    all_results = []
    for results in all_raw:
        all_results.extend(results)

    # If SearXNG returned basically nothing, fall back to DuckDuckGo
    if len(all_results) < 3:
        logger.info(f"[SEARCH] SearXNG returned only {len(all_results)} results, falling back to DDG")
        ddg_tasks = [_duckduckgo_search(q) for q in queries]
        ddg_raw = await asyncio.gather(*ddg_tasks, return_exceptions=True)
        for ddg_results in ddg_raw:
            if isinstance(ddg_results, list):
                all_results.extend(ddg_results)

    merged = _deduplicate(all_results)
    merged.sort(key=lambda r: r.get("score", 0), reverse=True)
    # For queries with CJK, push Chinese results to the top
    _has_cjk_query = any(any('一' <= ch <= '鿿' for ch in q) for q in queries)
    if _has_cjk_query:
        _cn = [r for r in merged if any('一' <= ch <= '鿿' for ch in (r.get('title','') + r.get('snippet','')))]
        _en = [r for r in merged if r not in _cn]
        merged = _cn + _en
    merged = merged[:MAX_RESULTS]

    # Enrich results with missing/short snippets
    enrich = []
    for r in merged[:5]:
        if r.get("url") and (not r.get("snippet") or len(r.get("snippet", "")) < 100):
            enrich.append(_fetch_page_content(r["url"]))
        else:
            enrich.append(_noop())

    contents = await asyncio.gather(*enrich, return_exceptions=True)
    for r, content in zip(merged[:5], contents):
        if isinstance(content, str) and content:
            if not r.get("snippet") or len(r["snippet"]) < 50:
                r["snippet"] = content[:300]
            r["content"] = content

    return [{"query": q, "results": merged} for q in queries]
