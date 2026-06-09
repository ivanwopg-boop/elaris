"""Self-hosted search aggregator: SearXNG + trafilatura.

- SearXNG: aggregates Google + Bing + DDG + Sogou + Baidu + Wikipedia
- trafilatura: lightweight page content extraction (no browser needed)
- Unlimited queries, no API keys, fully self-hosted
"""
import asyncio
import logging
from typing import Optional
import httpx
from trafilatura import extract

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://127.0.0.1:8888"
TIMEOUT = 12.0
MAX_RESULTS = 8


async def _searxng_search(query: str, language: str = "auto") -> list[dict]:
    """Search via local SearXNG instance."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{SEARXNG_URL}/search",
                params={"q": query, "format": "json", "language": language},
            )
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


async def _noop():
    return None


async def search_web(queries: list[str]) -> list[dict]:
    """
    SearXNG search + trafilatura extraction.

    1. Fire all queries to SearXNG in parallel
    2. Deduplicate and rank by relevance
    3. Enrich results that lack snippets via trafilatura
    """
    # Parallel search
    tasks = [_searxng_search(q) for q in queries]
    all_raw = await asyncio.gather(*tasks)

    all_results = []
    for results in all_raw:
        all_results.extend(results)

    merged = _deduplicate(all_results)
    merged.sort(key=lambda r: r.get("score", 0), reverse=True)
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
