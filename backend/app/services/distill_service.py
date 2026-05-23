"""Distillation service - core logic for soul generation."""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import (
    Persona, PersonaFile, PersonaManualInput,
    WebSearchResult, PersonaSoul, DistillationLog,
)
from app.models.schemas import PersonaProfile
from app.models.schemas import PersonaProfile
from app.core.minimax_client import minimax_client
from app.core.prompts import FIRST_DISTILL_PROMPT, UPDATE_DISTILL_PROMPT, SEARCH_ANALYSIS_PROMPT
from app.services.web_search import search_web


async def distill_persona(persona_id: str, db: AsyncSession) -> dict:
    """Run distillation for a persona, returns the new soul."""
    # 1. Load persona
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise ValueError(f"Persona {persona_id} not found")

    # 2. Gather all materials
    all_materials = await _gather_materials(persona_id, db)

    # 3. Check if existing soul
    soul_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    existing_soul = soul_result.scalars().first()

    # 4. Build prompt
    name = persona.name
    title_line = ""
    company_line = ""

    # Get title/company from manual inputs
    mi_result = await db.execute(
        select(PersonaManualInput).where(PersonaManualInput.persona_id == persona_id)
    )
    manual_inputs = mi_result.scalars().all()
    for mi in manual_inputs:
        if mi.field_key == "title":
            title_line = f"Title: {mi.field_value}\n"
        elif mi.field_key == "company":
            company_line = f"Company: {mi.field_value}\n"

    if existing_soul:
        # Ensure old soul data has all new fields (fill missing with defaults)
        try:
            old_profile = PersonaProfile(**json.loads(existing_soul.soul_json))
            normalized_soul = old_profile.model_dump_json(indent=2, ensure_ascii=False)
        except Exception:
            normalized_soul = existing_soul.soul_json

        # Update distillation
        prompt = UPDATE_DISTILL_PROMPT.format(
            name=name,
            soul_json=normalized_soul,
            new_materials=all_materials,
            all_materials=all_materials,
        )
        version_from = existing_soul.version
    else:
        # First distillation
        prompt = FIRST_DISTILL_PROMPT.format(
            name=name,
            title_line=title_line,
            company_line=company_line,
            all_materials=all_materials,
        )
        version_from = None

    # 5. Call LLM API
    messages = [
        {"role": "system", "content": "You are a professional personality analyst, skilled at distilling personality traits from text materials."},
        {"role": "user", "content": prompt},
    ]

    try:
        soul_data = await minimax_client.chat_json(messages, temperature=0.2, max_tokens=4096)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Distillation failed: {type(e).__name__}: {e}")

    # Validate it's a proper PersonaProfile
    try:
        profile = PersonaProfile(**soul_data)
    except Exception as e:
        raise ValueError(f"AI returned data format error: {e}\nRaw data: {str(soul_data)[:500]}")

    soul_json = profile.model_dump_json(indent=2, ensure_ascii=False)

    # 6. Count sources
    fc = await db.scalar(
        select(func.count()).select_from(PersonaFile).where(PersonaFile.persona_id == persona_id)
    )
    sc = await db.scalar(
        select(func.count()).select_from(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    file_count = fc or 0
    search_count = sc or 0
    total_sources = file_count + search_count

    # 7. Save new soul
    new_version = (existing_soul.version + 1) if existing_soul else 1
    new_soul = PersonaSoul(
        id=str(uuid.uuid4()),
        persona_id=persona_id,
        version=new_version,
        soul_json=soul_json,
        distill_source_count=total_sources,
    )
    db.add(new_soul)

    # 8. Log
    log = DistillationLog(
        id=str(uuid.uuid4()),
        persona_id=persona_id,
        version_from=version_from,
        version_to=new_version,
        input_summary=f"Files: {file_count}, Searches: {search_count}",
    )
    db.add(log)
    await db.flush()

    return {
        "persona_id": persona_id,
        "version": new_version,
        "soul": profile,
        "sources_used": total_sources,
    }


async def _gather_materials(persona_id: str, db: AsyncSession) -> str:
    """Gather all materials for distillation."""
    parts = []

    # Files
    file_result = await db.execute(
        select(PersonaFile).where(PersonaFile.persona_id == persona_id)
    )
    files = file_result.scalars().all()
    for f in files:
        if f.parsed_content:
            parts.append(f"### File: {f.file_name}\n{f.parsed_content}")

    # Manual inputs
    mi_result = await db.execute(
        select(PersonaManualInput).where(PersonaManualInput.persona_id == persona_id)
    )
    manual_inputs = mi_result.scalars().all()
    if manual_inputs:
        # Separate regular fields from long text (samples)
        regular = []
        samples = []
        for mi in manual_inputs:
            if mi.field_key in ("sample_text", "thinking_desc"):
                samples.append(mi)
            else:
                regular.append(mi)
        if regular:
            mi_text = "\n".join(f"- {mi.field_key}: {mi.field_value}" for mi in regular)
            parts.append(f"### Manual Input\n{mi_text}")
        for s in samples:
            label = "Original Text Sample" if s.field_key == "sample_text" else "Thinking Description"
            parts.append(f"### {label}\n{s.field_value}")

    # Web search results
    search_result = await db.execute(
        select(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    searches = search_result.scalars().all()
    for s in searches:
        parts.append(f"### Web Search: {s.query}\n{s.results_json}")

    return "\n\n".join(parts) if parts else "[No materials available]"


async def ensure_web_search_results(persona_id: str, db: AsyncSession) -> None:
    """
    Check if persona has web search results; if not, auto-generate queries
    from name/title/company and run searches, then use AI to analyze the
    search results into core cognitive traits before distillation.
    """
    # Check existing searches
    sr = await db.execute(
        select(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    existing = sr.scalars().all()
    if existing:
        return  # already have search results

    # Load persona info for query generation
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        return

    # Get title/company from manual inputs
    mi_result = await db.execute(
        select(PersonaManualInput).where(PersonaManualInput.persona_id == persona_id)
    )
    manual = {mi.field_key: mi.field_value for mi in mi_result.scalars().all()}

    title = manual.get("title", "")
    company = manual.get("company", "")
    name = persona.name

    # Build search queries (max 5 queries to avoid rate limits)
    queries = []
    if name:
        queries.append(name)
    if title and title not in queries:
        queries.append(f"{name} {title}" if name else title)
    if company and company not in queries:
        queries.append(f"{name} {company}" if name else company)
    if name and title and company:
        queries.append(f"{name} {title} {company}")
    queries = queries[:5]

    # Run searches and collect all results
    batch = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    all_results = []

    for query in queries:
        search_results = await search_web([query])
        for sr_item in search_results:
            for r in sr_item.get("results", [])[:6]:
                ws = WebSearchResult(
                    id=str(uuid.uuid4()),
                    persona_id=persona_id,
                    query=sr_item["query"],
                    results_json=json.dumps([r], ensure_ascii=False),
                    search_batch=batch,
                    created_at=now,
                )
                db.add(ws)
                all_results.append(r)

    await db.flush()

    # If we got real results, use AI to analyze them into cognitive traits
    # AI analysis step: always run - use search results if available, otherwise use persona info
    manual_info = ""
    if manual:
        manual_info = "\n".join(f"- {k}: {v}" for k, v in manual.items() if v)
    analysis_context = ""
    if all_results and any(r.get("title") for r in all_results):
        formatted = []
        for r in all_results[:30]:
            entry = "Title: " + (r.get("title") or "") + "\nSummary: " + (r.get("snippet") or "") + "\nLink: " + (r.get("url") or "")
            formatted.append(entry)
        analysis_context = "\n---\n".join(formatted)
    elif manual_info or name:
        analysis_context = "[No web search results. Inferring cognitive traits from basic info]\n" + manual_info

    if analysis_context:
        analysis_prompt = SEARCH_ANALYSIS_PROMPT.format(
            name=name,
            search_results=analysis_context,
        )
        messages = [
            {"role": "system", "content": "You are a cognitive analysis expert, skilled at distilling a person's core cognitive traits from search results or basic info."},
            {"role": "user", "content": analysis_prompt},
        ]
        try:
            analysis = await minimax_client.chat_json(messages, temperature=0.2, max_tokens=1024)
            analysis_ws = WebSearchResult(
                id=str(uuid.uuid4()),
                persona_id=persona_id,
                query="[AI Cognitive Analysis]",
                results_json=json.dumps({"type": "search_analysis", "data": analysis}, ensure_ascii=False),
                search_batch=batch,
                created_at=now,
            )
            db.add(analysis_ws)
            await db.flush()
        except Exception:
            pass

    return
