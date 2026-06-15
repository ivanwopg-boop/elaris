"""Elaris Search Pipeline: SearXNG (primary) + Exa (fallback).

Architecture:
  SearXNG ── self-hosted, 246 engines, English+Chinese, timeout 8s
  Exa     ── semantic search via mcporter, used as fallback
  Strategy: race both, return first success. SearXNG alone is enough
  for 90% queries; Exa kicks in when SearXNG is slow or returns <3 results.
"""

import asyncio
import logging
import subprocess
import json as _json
from typing import Optional
import httpx

logger = logging.getLogger("uvicorn")

SEARXNG_URL = "http://localhost:8888/search"
TIMEOUT = 8.0
MAX_RESULTS = 8
MIN_GOOD_RESULTS = 3


# ── SearXNG (Primary, self-hosted) ───────────────────────

async def _searxng_search(query: str, category: str = "general") -> list[dict]:
    """Search via self-hosted SearXNG — aggregates Google/Bing/Brave/Startpage/Baidu/Sogou/Bilibili/Wikipedia."""
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


# ── Exa (Fallback, via mcporter) ─────────────────────────

def _exa_search_sync(query: str, num_results: int = 5) -> list[dict]:
    """Semantic web search via Exa AI (free tier, mcporter)."""
    try:
        cmd = [
            "mcporter", "call",
            f'exa.web_search_exa(query: "{query}", numResults: {num_results}, useAutoprompt: true)',
            "--timeout", "120000"
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            # Parse mcporter output which may contain both logs and JSON
            stdout = result.stdout.strip()
            if not stdout:
                logger.warning(f"[Exa] Empty output for: {query[:60]}")
                return []
            # Find the JSON part
            try:
                data = _json.loads(stdout)
            except _json.JSONDecodeError:
                # Try to extract JSON from mixed output
                for line in stdout.split('\n'):
                    line = line.strip()
                    if line.startswith('{'):
                        try:
                            data = _json.loads(line)
                            break
                        except _json.JSONDecodeError:
                            continue
                else:
                    logger.warning(f"[Exa] Could not parse JSON for: {query[:60]}")
                    return []
        else:
            data = _json.loads(stdout) if stdout else {}

        results = data.get("results", [])
        if isinstance(results, list):
            output = []
            for r in results[:num_results]:
                output.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("text", "") or " ".join(r.get("highlights", [])),
                    "engines": ["exa"],
                    "score": r.get("score", 0.6),
                    "source": "exa",
                })
            logger.info(f"[Exa] {len(output)} results for: {query[:60]}")
            return output
        return []
    except subprocess.TimeoutExpired:
        logger.warning(f"[Exa] Subprocess timeout for: {query[:60]}")
        return []
    except Exception as e:
        logger.warning(f"[Exa] Failed for '{query[:60]}': {e}")
        return []


async def _exa_search(query: str, num_results: int = 5) -> list[dict]:
    """Async wrapper for Exa search."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _exa_search_sync, query, num_results)


# ── Combined Search (race SearXNG vs Exa) ─────────────────

async def _search_one(query: str) -> list[dict]:
    """Search one query: race SearXNG vs Exa, use first with >=MIN_GOOD_RESULTS.
    
    If both return but SearXNG has <3 results, merge with Exa.
    If SearXNG times out, use Exa alone.
    If both fail, return empty."""
    
    # Race both backends simultaneously
    searx_task = asyncio.create_task(_searxng_search(query))
    exa_task = asyncio.create_task(_exa_search(query))
    
    # Wait for first completion
    done, pending = await asyncio.wait(
        [searx_task, exa_task],
        return_when=asyncio.FIRST_COMPLETED,
        timeout=TIMEOUT + 2
    )
    
    searx_results = []
    exa_results = []
    
    for task in done:
        try:
            result = task.result()
        except Exception:
            result = []
        if task is searx_task:
            searx_results = result
        else:
            exa_results = result
    
    # If SearXNG returned enough results, use it
    if searx_results and len(searx_results) >= MIN_GOOD_RESULTS:
        # Cancel Exa if still running (save credits)
        if not exa_task.done():
            exa_task.cancel()
        return searx_results
    
    # Wait for the other task if still pending
    if pending:
        try:
            remaining_done, _ = await asyncio.wait(pending, timeout=3)
            for task in remaining_done:
                try:
                    result = task.result()
                except Exception:
                    result = []
                if task is searx_task:
                    searx_results = result
                else:
                    exa_results = result
        except Exception:
            pass
    
    # Merge: SearXNG first, Exa supplements
    merged = list(searx_results)
    seen_urls = {r.get("url") for r in merged}
    for r in exa_results:
        if r.get("url") not in seen_urls:
            merged.append(r)
            seen_urls.add(r.get("url"))
    
    return merged[:MAX_RESULTS]


# ── Main Search ──────────────────────────────────────────

async def search_web(queries: list[str]) -> list[dict]:
    """Search multiple queries in parallel via SearXNG + Exa fallback."""
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


# ── Full-page content scraping ───────────────────────────

async def scrape_top_results(results: list[dict], max_pages: int = 3) -> str:
    """Fetch full content from top search results. Returns formatted text."""
    import trafilatura
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
