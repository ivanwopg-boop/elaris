"""Search: SearXNG (primary, self-hosted) + DuckDuckGo (fallback)."""

import asyncio
import logging
from typing import Optional
import httpx
from trafilatura import extract

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://localhost:8888/search"
TIMEOUT = 8.0
MAX_RESULTS = 8


# ── SearXNG (Primary, self-hosted) ───────────────────────

async def _searxng_search(query: str, category: str = "general") -> list[dict]:
    """Search via self-hosted SearXNG instance — unlimited, aggregates Google/Bing/DDG/Baidu."""
    try:
        params = {
            "q": query,
            "format": "json",
            "language": "auto",
            "categories": category,
            "pageno": 1,
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(SEARXNG_URL, params=params)
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
                    "engines": r.get("engines", ["searxng"]),
                    "score": r.get("score", 0.8),
                })
            return results
    except Exception as e:
        logger.warning(f"[SearXNG] Failed for '{query[:60]}': {e}")
        return []


# ── DuckDuckGo (Fallback) ────────────────────────────────

def _duckduckgo_search_sync(query: str, max_results: int = 5) -> list[dict]:
    """Direct DuckDuckGo search via ddgs library."""
    try:
        from ddgs import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                    "engines": ["duckduckgo"],
                    "score": 0.5,
                })
        return results
    except Exception as e:
        logger.warning(f"[DDG] Search failed for '{query[:60]}': {e}")
        return []


async def _search_one(query: str) -> list[dict]:
    """Search one query: SearXNG first, DDG fallback. DDG if SearXNG returns < 3."""
    results = await _searxng_search(query, "general")
    if len(results) < 3:
        ddg = _duckduckgo_search_sync(query)
        results.extend(ddg)
    return results


# ── Main Search ──────────────────────────────────────────

async def search_web(queries: list[str]) -> list[dict]:
    """Search multiple queries in parallel via SearXNG + DDG fallback."""
    if not queries:
        return []
    tasks = [_search_one(q) for q in queries]
    all_raw = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for i, results in enumerate(all_raw):
        if isinstance(results, list):
            output.append({"query": queries[i], "results": results})
        else:
            output.append({"query": queries[i], "results": []})
    return output


# ── Auto-search for distillation ─────────────────────────

async def ensure_web_search_results(persona_id: str, db) -> None:
    """Auto-generate web search results for new personas before distillation."""
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
            ws = WebSearchResult(
                id=str(uuid.uuid4()),
                persona_id=persona_id,
                query=query,
                results_json=json.dumps([r], ensure_ascii=False),
                search_batch=batch,
                created_at=now,
            )
            db.add(ws)

    await db.commit()
