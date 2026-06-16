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
SEARXNG_ENGINES = "bing,brave,startpage,duckduckgo,google"
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


async def _searxng_search(query: str) -> list[dict]:
    import httpx
    try:
        # NOTE: do NOT pass language=auto — it returns 0 for non-ASCII queries.
        # SearXNG default is "all" which works for both Chinese and English.
        params = {
            "q": query, "format": "json",
            "pageno": 1, "engines": SEARXNG_ENGINES,
        }
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
            else:
                _record_empty()
            return results
    except asyncio.TimeoutError:
        logger.warning(f"[SearXNG] Timeout for: {query[:60]}")
        _record_empty()
        return []
    except Exception as e:
        logger.warning(f"[SearXNG] Failed for '{query[:60]}': {e}")
        _record_empty()
        return []


async def _search_one(query: str) -> list[dict]:
    return await _searxng_search(query)


async def search_web(queries: list[str]) -> list[dict]:
    """Run multiple search queries in parallel.

    Returns a list of {query, results}. Never raises; logs warnings only.
    """
    if not queries:
        return []
    tasks = [asyncio.create_task(_search_one(q)) for q in queries]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [{"query": queries[i], "results": r if isinstance(r, list) else []} for i, r in enumerate(results)]


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
