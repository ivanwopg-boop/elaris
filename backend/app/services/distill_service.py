"""Distillation service - core logic for soul generation (v1 + v2 support)."""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import (
    Persona, PersonaFile, PersonaManualInput,
    WebSearchResult, PersonaSoul, DistillationLog,
)
from app.models.schemas import PersonaProfile, CognitiveProfileV2
from app.core.minimax_client import minimax_client
from app.core.prompts import (
    FIRST_DISTILL_PROMPT, FIRST_DISTILL_PROMPT_ZH_CN, FIRST_DISTILL_PROMPT_ZH_TW,
    UPDATE_DISTILL_PROMPT, SEARCH_ANALYSIS_PROMPT,
    FIRST_DISTILL_PROMPT_V2, UPDATE_DISTILL_PROMPT_V2,
)
from app.services.web_search import search_web


def _detect_version(soul_json: str) -> str:
    """Detect soul schema version from JSON string."""
    try:
        data = json.loads(soul_json)
        return data.get("schema_version", "1.0")
    except Exception:
        return "1.0"


def _get_distill_prompt(lang: str, name: str, title_line: str, company_line: str,
                       all_materials: str, existing_soul, use_v2: bool):
    """Select the right prompt template based on version."""
    if use_v2:
        # v2 always uses fresh first-distillation prompt to avoid v1 structure bias
        prompt = FIRST_DISTILL_PROMPT_V2.format(
            name=name,
            title_line=title_line,
            company_line=company_line,
            all_materials=all_materials,
        )
        version_from = existing_soul.version if existing_soul else None
    else:
        # v1 path
        if lang == 'zh-CN':
            base = FIRST_DISTILL_PROMPT_ZH_CN
        else:
            base = FIRST_DISTILL_PROMPT
        version_from = existing_soul.version if existing_soul else None
        if existing_soul:
            try:
                old_profile = PersonaProfile(**json.loads(existing_soul.soul_json))
                normalized_soul = old_profile.model_dump_json(indent=2, ensure_ascii=False)
            except Exception:
                normalized_soul = existing_soul.soul_json
            prompt = UPDATE_DISTILL_PROMPT.format(
                name=name,
                soul_json=normalized_soul,
                new_materials=all_materials,
                all_materials=all_materials,
            )
        else:
            prompt = base.format(
                name=name,
                title_line=title_line,
                company_line=company_line,
                all_materials=all_materials,
            )
    return prompt, version_from


async def distill_persona(persona_id: str, db: AsyncSession, lang: str = "en",
                        use_v2: bool = False) -> dict:
    """Run distillation for a persona, returns the new soul."""
    # 1. Load persona
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise ValueError(f"Persona {persona_id} not found")

    # 2. Gather all materials
    all_materials = await _gather_materials(persona_id, db)

    # 3. Check if existing soul for this lang (for update prompt)
    soul_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id, PersonaSoul.lang == lang)
        .order_by(PersonaSoul.version.desc())
    )
    existing_soul = soul_result.scalars().first()

    # 4. Build prompt
    name = persona.name
    title_line = ""
    company_line = ""

    mi_result = await db.execute(
        select(PersonaManualInput).where(PersonaManualInput.persona_id == persona_id)
    )
    manual_inputs = mi_result.scalars().all()
    for mi in manual_inputs:
        if mi.field_key == "title":
            title_line = f"Title: {mi.field_value}\n"
        elif mi.field_key == "company":
            company_line = f"Company: {mi.field_value}\n"

    prompt, version_from = _get_distill_prompt(
        lang, name, title_line, company_line, all_materials, existing_soul, use_v2)

    # 5. Call LLM API
    lang_instruction = "Output exclusively in Chinese (中文)." if lang == "zh-CN" else "Output exclusively in English."
    system_msg = (
        "You are a professional personality analyst, skilled at distilling "
        "personality traits from text materials. "
    )
    if use_v2:
        system_msg = (
            "You are a cognitive biographer. Your task is to construct a deep "
            "cognitive portrait -- not cataloguing facts, but understanding how "
            "this person actually thinks, what they believe in their bones, "
            "what makes them react, and how they express themselves. "
        )
    system_msg += lang_instruction
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": prompt},
    ]

    try:
        soul_data = await minimax_client.chat_json(messages, temperature=0.2, max_tokens=8192)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Distillation failed: {type(e).__name__}: {e}")

    # 6. Validate and parse
    try:
        def fix_floats(obj, path=""):
            if isinstance(obj, dict):
                return {k: fix_floats(v, f"{path}.{k}") for k, v in obj.items()}
            elif isinstance(obj, list):
                return [fix_floats(v, f"{path}[i]") for v in obj]
            elif isinstance(obj, float) and obj < 1:
                return int(obj * 100)
            return obj
        soul_data = fix_floats(soul_data)

        if use_v2:
            profile = CognitiveProfileV2(**soul_data)
        else:
            profile = PersonaProfile(**soul_data)
    except Exception as e:
        raise ValueError(f"AI returned data format error: {e}\nRaw data: {str(soul_data)[:500]}")

    soul_json = profile.model_dump_json(indent=2, ensure_ascii=False)

    # 7. Count sources
    fc = await db.scalar(
        select(func.count()).select_from(PersonaFile).where(PersonaFile.persona_id == persona_id)
    )
    sc = await db.scalar(
        select(func.count()).select_from(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    file_count = fc or 0
    search_count = sc or 0
    total_sources = file_count + search_count

    # 8. Save new soul
    new_version = (existing_soul.version + 1) if existing_soul else 1
    new_soul = PersonaSoul(
        id=str(uuid.uuid4()),
        persona_id=persona_id,
        version=new_version,
        lang=lang,
        soul_json=soul_json,
        distill_source_count=total_sources,
        distill_file_ids="[]",
        distill_search_ids="[]",
    )
    db.add(new_soul)

    # 9. Auto-update persona.description from v2 identity
    if use_v2:
        try:
            v2_data = json.loads(soul_json)
            identity = v2_data.get("identity", {})
            title = identity.get("title", "")
            organization = identity.get("organization", "")
            life_arc = identity.get("life_arc", "")
            if title or organization or life_arc:
                desc_parts = []
                if title:
                    desc_parts.append(title)
                if organization:
                    desc_parts.append(f"at {organization}")
                if life_arc and len(life_arc)< 200:
                    desc_parts.append(f"-- {life_arc}")
                if desc_parts:
                    persona.description = " | ".join(desc_parts)
                    db.add(persona)
        except Exception:
            pass  # Non-critical, don't fail distillation over description

    # 10. Log
    log = DistillationLog(
        id=str(uuid.uuid4()),
        persona_id=persona_id,
        version_from=version_from,
        version_to=new_version,
        input_summary=f"Files: {file_count}, Searches: {search_count}",
    )
    db.add(log)
    await db.commit()

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

    return "\n\n".join(parts) if parts else "[NO SEARCH RESULTS AVAILABLE - You MUST rely entirely on your training knowledge about the target. Use what you know.]"


async def ensure_web_search_results(persona_id: str, db: AsyncSession) -> None:
    """
    Check if persona has web search results; if not, auto-generate queries
    from name/title/company and run searches via AnySearch.
    """
    sr = await db.execute(
        select(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    existing = sr.scalars().all()
    if existing:
        return

    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        return

    mi_result = await db.execute(
        select(PersonaManualInput).where(PersonaManualInput.persona_id == persona_id)
    )
    manual = {mi.field_key: mi.field_value for mi in mi_result.scalars().all()}

    title = manual.get("title", "")
    company = manual.get("company", "")
    name = persona.name

    # Build search queries (max 5)
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

    await db.commit()
    return