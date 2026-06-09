"""Self-hosted search aggregator using DuckDuckGo + trafilatura page extraction.

Replaces AnySearch API with zero-cost, unlimited searches.
"""
import asyncio
import httpx
from typing import Optional
from ddgs import DDGS
from trafilatura import extract
import concurrent.futures

TIMEOUT = 15.0  # seconds for page fetching
MAX_RESULTS = 5  # search results per query
PAGE_EXTRACT_TIMEOUT = 8.0  # seconds for extracting page content


async def _fetch_page_content(url: str) -> Optional[str]:
    """Fetch and extract clean text content from a webpage."""
    try:
        async with httpx.AsyncClient(timeout=PAGE_EXTRACT_TIMEOUT, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "ElarisBot/1.0 (self-hosted)"})
            if r.status_code == 200 and r.text:
                # trafilatura is synchronous, run in executor
                loop = asyncio.get_event_loop()
                text = await loop.run_in_executor(
                    None, lambda: extract(r.text, url=url,
                        include_comments=False, include_tables=False,
                        fast=True)
                )
                if text:
                    return text[:1000]  # First 1000 chars of extracted content
    except Exception:
        pass
    return None


def _ddg_search(query: str, max_results: int = MAX_RESULTS) -> list[dict]:
    """Synchronous DuckDuckGo search."""
    try:
        with DDGS() as ddgs:
            results = []
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
            return results
    except Exception:
        return []


async def search_web(queries: list[str]) -> list[dict]:
    """
    Self-hosted web search aggregator.
    
    For each query:
    1. Search DuckDuckGo for results
    2. Fetch + extract content from top result URLs
    3. Return enriched results with page content
    
    Args:
        queries: List of search queries
        
    Returns:
        List of {"query": str, "results": [{"title": str, "snippet": str, "url": str, "content": str}]}
    """
    all_results = []
    
    for query in queries:
        # 1. Search DuckDuckGo
        results = _ddg_search(query, max_results=MAX_RESULTS)
        
        # 2. Fetch page content for top 2 results
        for i, r in enumerate(results[:2]):
            if r.get("url"):
                content = await _fetch_page_content(r["url"])
                if content:
                    r["content"] = content
        
        all_results.append({"query": query, "results": results})
    
    return all_results
