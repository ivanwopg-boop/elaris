"""Search: AnySearch (primary, free 1000/day) + DuckDuckGo (fallback)."""

import asyncio
import logging
from typing import Optional
import httpx
from trafilatura import extract

logger = logging.getLogger("uvicorn")

ANYSEARCH_URL = "https://api.anysearch.com/mcp"
TIMEOUT = 12.0
MAX_RESULTS = 15


# ── AnySearch (Primary) ──────────────────────────────────

async def _anysearch_search(query: str, max_results: int = 10) -> list[dict]:
    """Search via AnySearch API — free, anonymous access, 1000 req/day."""
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "search",
                "arguments": {"query": query, "max_results": max_results},
            },
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                ANYSEARCH_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                logger.warning(f"[AnySearch] HTTP {resp.status_code} for: {query[:60]}")
                return []
            data = resp.json()
            result = data.get("result", {})
            content = result.get("content", [])
            if not content:
                return []
            # AnySearch returns [{type: "text", text: "## Search Results (N results...)..."}]
            # Parse the markdown text into structured results
            text = content[0].get("text", "") if content else ""
            return _parse_anysearch_markdown(text)
    except Exception as e:
        logger.warning(f"[AnySearch] Failed for '{query[:60]}': {e}")
        return []


def _parse_anysearch_markdown(text: str) -> list[dict]:
    """Parse AnySearch markdown response into structured results.
    
    Format:
    ## Search Results (N results, Xms)
    ### 1. Title
    - **URL**: https://...
    - Description text...
    """
    import re
    results = []
    # Split by "### N. " pattern
    items = re.split(r'\n### \d+\. ', text)
    for item in items[1:]:  # skip header
        lines = item.strip().split('\n')
        title = lines[0].strip() if lines else ""
        url = ""
        snippet_parts = []
        for line in lines[1:]:
            url_match = re.match(r'- \*\*URL\*\*:\s*(.+)', line)
            if url_match:
                url = url_match.group(1).strip()
            elif line.strip() and not line.startswith('##'):
                snippet_parts.append(line.strip().lstrip('- '))
        if title and url:
            results.append({
                "title": title,
                "url": url,
                "snippet": " ".join(snippet_parts)[:500],
                "engines": ["anysearch"],
                "score": 0.8,
            })
    return results


# ── DuckDuckGo (Fallback) ────────────────────────────────

def _duckduckgo_search_sync(query: str, max_results: int = 10) -> list[dict]:
    """Direct DuckDuckGo search via duckduckgo_search library."""
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


async def _search_one(query: str) -> list[dict]:
    """Search one query: AnySearch first, fall back to DDG."""
    results = await _anysearch_search(query)
    if len(results) < 3:
        ddg = _duckduckgo_search_sync(query)
        results.extend(ddg)
    return results


# ── Main Search ──────────────────────────────────────────

async def search_web(queries: list[str]) -> list[dict]:
    """Search via AnySearch + DDG fallback."""
    tasks = [_search_one(q) for q in queries]
    all_raw = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for i, results in enumerate(all_raw):
        if isinstance(results, list):
            output.append({"query": queries[i], "results": results})
        else:
            output.append({"query": queries[i], "results": []})
    return output


# ── Page Content Extraction ──────────────────────────────

def _deduplicate(results: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for r in results:
        url = r.get("url", "")
        if url and url not in seen:
            seen.add(url)
            out.append(r)
    return out


async def _fetch_page_content(url: str) -> Optional[str]:
    """Extract page content with trafilatura."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, follow_redirects=True)
            if resp.status_code == 200:
                text = extract(resp.text)
                return text[:2000] if text else None
    except Exception:
        pass
    return None


async def ensure_web_search_results(persona_id: str, db) -> None:
    """Auto-generate web search results for new personas before distillation.

    Uses source_name (real person) for search queries, not persona.name (AI display name).
    """
    import uuid
    import json
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.db_models import Persona, WebSearchResult

    result = await db.execute(select(WebSearchResult).where(
        WebSearchResult.persona_id == persona_id
    ).limit(1))
    if result.scalars().first():
        return  # Already has search results

    pr = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = pr.scalar_one_or_none()
    if not persona:
        return

    search_name = persona.source_name or persona.name

    queries = [f"{search_name} {q}" for q in [
        "biography life story career", "early life childhood family background",
        "achievements awards milestones", "philosophy beliefs worldview",
        "interview quotes thoughts opinions", "mental models thinking style",
        "intellectual influences heroes mentors", "turning point life-changing moment",
        "personality traits character habits", "legacy impact influence on field",
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
