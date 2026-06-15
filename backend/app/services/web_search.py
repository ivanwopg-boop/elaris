"""Elaris Search Pipeline: SearXNG (self-hosted, curated engines).

Engines: baidu,sogou,bing,brave,wikipedia,wikidata
Timeout: 8s
"""

import asyncio
import logging
from typing import Optional
import httpx
from trafilatura import extract

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://localhost:8888/search"
TIMEOUT = 8.0
MAX_RESULTS = 8
# Curated stable engines (DDG times out, Google/Startpage CAPTCHA'd on DC IPs)
# Bing handles both Chinese and English. Brave/Wikipedia/Wikidata are English supplements.
# Baidu/Sogou suspended (CAPTCHA on DC IPs). Google also CAPTCHA'd.
# DDG always times out. Startpage CAPTCHA'd.
SEARXNG_ENGINES = "bing,brave,wikipedia,wikidata"


async def _searxng_search(query: str) -> list[dict]:
    """Search via self-hosted SearXNG with curated stable engines."""
    try:
        params = {
            "q": query,
            "format": "json",
            "language": "auto",
            "pageno": 1,
            "engines": SEARXNG_ENGINES,
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
                    "source": "searxng",
                })
            logger.info(f"[SearXNG] {len(results)} results for: {query[:60]}")
            return results
    except asyncio.TimeoutError:
        logger.warning(f"[SearXNG] Timeout ({TIMEOUT}s) for: {query[:60]}")
        return []
    except Exception as e:
        logger.warning(f"[SearXNG] Failed for '{query[:60]}': {e}")
        return []


async def _search_one(query: str) -> list[dict]:
    """Search one query via SearXNG."""
    return await _searxng_search(query)


async def search_web(queries: list[str]) -> list[dict]:
    """Search multiple queries in parallel."""
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


async def scrape_top_results(results: list[dict], max_pages: int = 3) -> str:
    """Fetch full content from top search results. Returns formatted text."""
    full_texts = []
    for r in results[:max_pages]:
        try:
            url = r.get("url", "")
            if not url or any(d in url for d in ["passport.weibo", "xiaohongshu.com"]):
                continue
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(url, follow_redirects=True,
                    headers={"User-Agent": "Mozilla/5.0 ElarisSearch/1.0"})
                text = trafilatura.extract(resp.text)
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
