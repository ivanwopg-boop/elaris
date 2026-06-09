"""Multi-engine search aggregator — DuckDuckGo + Google + Bing.

Self-hosted, zero API keys, unlimited queries.
"""
import asyncio
import concurrent.futures
from typing import Optional
import httpx
from trafilatura import extract

TIMEOUT = 15.0
MAX_PER_ENGINE = 5
PAGE_TIMEOUT = 8.0


def _search_ddg(query: str, max_results: int = MAX_PER_ENGINE) -> list[dict]:
    """DuckDuckGo search (includes Bing index)."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            return [{"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")}
                    for r in ddgs.text(query, max_results=max_results)]
    except Exception:
        return []


def _search_google(query: str, max_results: int = MAX_PER_ENGINE) -> list[dict]:
    """Google search."""
    try:
        from googlesearch import search
        results = []
        for url in search(query, num_results=max_results, sleep_interval=0.5, lang="en"):
            results.append({"title": "", "url": url, "snippet": ""})
        return results
    except Exception:
        return []


def _search_bing(query: str, max_results: int = MAX_PER_ENGINE) -> list[dict]:
    """Bing search via DuckDuckGo's Bing-backed results."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            return [{"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")}
                    for r in ddgs.text(f"{query} bing", max_results=max_results)]
    except Exception:
        return []


def _deduplicate(results: list[dict]) -> list[dict]:
    """Merge results, deduplicate by URL, keep best snippet."""
    seen = set()
    merged = []
    for r in results:
        url = r.get("url", "")
        if url and url not in seen:
            seen.add(url)
            merged.append(r)
    return merged


async def _fetch_page_content(url: str) -> Optional[str]:
    """Fetch and extract clean text from a webpage."""
    try:
        async with httpx.AsyncClient(timeout=PAGE_TIMEOUT, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "ElarisBot/1.0 (self-hosted)"})
            if r.status_code == 200 and r.text:
                loop = asyncio.get_event_loop()
                text = await loop.run_in_executor(
                    None, lambda: extract(r.text, url=url, include_comments=False, include_tables=False, fast=True)
                )
                return text[:1000] if text else None
    except Exception:
        pass
    return None


async def search_web(queries: list[str]) -> list[dict]:
    """
    Multi-engine web search aggregator.

    1. Search DuckDuckGo + Google + Bing in parallel
    2. Merge and deduplicate results
    3. Fetch page content for top results
    """
    all_results = []

    for query in queries:
        # Run all 3 engines in parallel via thread pool
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            ddg_fut = pool.submit(_search_ddg, query)
            google_fut = pool.submit(_search_google, query)
            bing_fut = pool.submit(_search_bing, query)

            ddg_results = ddg_fut.result()
            google_results = google_fut.result()
            bing_results = bing_fut.result()

        # Merge and deduplicate
        merged = _deduplicate(google_results + ddg_results + bing_results)
        merged = merged[:8]  # Keep top 8 total

        # Enrich top results with page content
        for r in merged[:5]:
            if r.get("url") and not r.get("content"):
                content = await _fetch_page_content(r["url"])
                if content:
                    if not r.get("snippet"):
                        r["snippet"] = content[:300]
                    r["content"] = content

        all_results.append({"query": query, "results": merged})

    return all_results
