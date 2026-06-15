"""Elaris Search Pipeline: SearXNG via Bing (reliable for both Chinese & English).

Why Bing-only: Baidu/Sogou/Google CAPTCHA on DC IPs. DDG always times out.
Bing indexes Chinese content (百度百科, Wikipedia zh, Bilibili, etc.) just fine.
"""

import asyncio
import logging
import httpx
from trafilatura import extract

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://localhost:8888/search"
TIMEOUT = 8.0
MAX_RESULTS = 8
SEARXNG_ENGINES = "bing"


async def _searxng_search(query: str) -> list[dict]:
    try:
        params = {
            "q": query, "format": "json", "language": "auto",
            "pageno": 1, "engines": SEARXNG_ENGINES,
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
        logger.warning(f"[SearXNG] Timeout for: {query[:60]}")
        return []
    except Exception as e:
        logger.warning(f"[SearXNG] Failed for '{query[:60]}': {e}")
        return []


async def _search_one(query: str) -> list[dict]:
    return await _searxng_search(query)


async def search_web(queries: list[str]) -> list[dict]:
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
            ws = WebSearchResult(
                id=str(uuid.uuid4()), persona_id=persona_id, query=query,
                results_json=json.dumps([r], ensure_ascii=False),
                search_batch=batch, created_at=now,
            )
            db.add(ws)
    await db.commit()
