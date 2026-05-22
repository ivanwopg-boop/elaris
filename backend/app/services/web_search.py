"""Web search service for supplementing persona knowledge."""

import json
import httpx
from app.config import get_settings

settings = get_settings()


async def search_web(queries: list[str]) -> list[dict]:
    """
    Perform web searches for multiple queries.
    Returns list of {"query": str, "results": [{"title": str, "snippet": str, "url": str}]}
    """
    all_results = []
    for query in queries:
        results = await _single_search(query)
        all_results.append({
            "query": query,
            "results": results,
        })
    return all_results


async def _single_search(query: str) -> list[dict]:
    """Perform a single web search using a search API.
    Falls back to a simple implementation if no search API key is configured.
    """
    # TODO: Integrate with actual search API (Tavily, SerpAPI, etc.)
    # For MVP, we'll use a basic approach
    try:
        # Try using DuckDuckGo HTML search as fallback
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://html.duckduckgo.com/html/",
                params={"q": query},
                headers={"User-Agent": "Mozilla/5.0 (compatible; PersonaDistiller/1.0)"},
            )
            if resp.status_code == 200:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "lxml")
                results = []
                for item in soup.select(".result")[:5]:
                    title_el = item.select_one(".result__title a")
                    snippet_el = item.select_one(".result__snippet")
                    if title_el:
                        results.append({
                            "title": title_el.get_text(strip=True),
                            "url": title_el.get("href", ""),
                            "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                        })
                return results
    except Exception:
        pass

    return [{"query": query, "note": "Search service not configured. Please configure the search API key."}]
