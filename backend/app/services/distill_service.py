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
    FIRST_DISTILL_PROMPT_V3, FIRST_DISTILL_PROMPT_V2, UPDATE_DISTILL_PROMPT_V2,
)
from app.services.web_search import search_web


def _build_source_bio(name: str, all_materials: str) -> str:
    """Extract a short 1-2 sentence bio from search materials for the compliance layer."""
    # Find the biography search result
    bio_keywords = ["biography", "life story", "career", "简介", "生平"]
    best_snippet = ""
    for section in all_materials.split("### Web Search:"):
        for kw in bio_keywords:
            if kw.lower() in section.lower()[:80]:
                # Extract first meaningful snippet
                snippets = section.split('"snippet":')
                for s in snippets[1:3]:
                    snippet = s.split('"')[1] if '"' in s[:20] else s[:200]
                    if len(snippet) > 40 and name[:2] not in snippet[:4]:
                        best_snippet = snippet[:300]
                        break
                if best_snippet:
                    break
        if best_snippet:
            break
    if best_snippet:
        return f"{name}: {best_snippet.strip()}"
    return name

# ── AI Persona Naming ────────────────────────────────────
NAME_GEN_PROMPT = """You are a creative naming AI. Given a person's distilled cognitive profile, generate 5 creative, evocative names for an AI persona inspired by them.

Rules:
- Names must NOT be the real person's name
- Names must NOT contain obvious reference to the real person (no initials, no puns on their name)
- Names should be poetic, memorable, and evoke the person's CORE ESSENCE
- Mix styles: some abstract, some trait-based, some metaphorical
- 2-4 words max each
- Output as JSON array of 5 strings
- Output in English (the frontend will translate if needed)

Real name: {real_name}
Brief identity: {identity_summary}
Core traits distilled: {traits_summary}

Output ONLY a JSON array like: ["Silicon Prophet", "The Perfectionist", ...]"""


async def generate_persona_names(
    persona_id: str,
    real_name: str,
    db: AsyncSession,
) -> list[str]:
    """After distillation, generate creative AI persona names."""
    import json as _jsonx

    result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id, PersonaSoul.lang == "en")
        .order_by(PersonaSoul.version.desc())
    )
    soul = result.scalars().first()
    if not soul:
        return []

    try:
        soul_data = _jsonx.loads(soul.soul_json)
    except Exception:
        return []

    identity = soul_data.get("identity", {})
    identity_summary = (
        f"{identity.get('title', '')} / {identity.get('organization', '')}"
    ).strip(" /")

    traits = []
    cog = soul_data.get("cognitive_architecture", {})
    beliefs = cog.get("core_beliefs", []) or []
    if isinstance(beliefs, list) and beliefs:
        traits += [b.get("belief", str(b)) for b in beliefs[:3]]

    emo = soul_data.get("emotional_map") or soul_data.get("emotional_reactive_system", {})
    if isinstance(emo, dict):
        triggers = emo.get("triggers", [])
        if isinstance(triggers, list) and triggers:
            t0 = triggers[0]
            traits.append(t0.get("trigger", str(t0)) if isinstance(t0, dict) else str(t0))

    voice = soul_data.get("voice") or soul_data.get("communication_profile", {})
    if isinstance(voice, dict):
        phrases = voice.get("phrases") or voice.get("signature_expressions", [])
        if isinstance(phrases, list) and phrases:
            traits.append(str(phrases[0]))

    traits_summary = " | ".join(filter(None, traits[:5])) or "visionary thinker"

    messages = [
        {"role": "system", "content": "You are a creative naming specialist. Output JSON only."},
        {"role": "user", "content": NAME_GEN_PROMPT.format(
            real_name=real_name,
            identity_summary=identity_summary or real_name,
            traits_summary=traits_summary,
        )},
    ]

    try:
        names = await minimax_client.chat_json(messages, temperature=0.8, max_tokens=512)
        if isinstance(names, list) and all(isinstance(n, str) for n in names):
            return [n for n in names if n and n.lower() != real_name.lower()][:5]
        return []
    except Exception:
        return []


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
        prompt = FIRST_DISTILL_PROMPT_V3.format(name=name, all_materials=all_materials)
        version_from = existing_soul.version if existing_soul else None
        # zh-CN: enforce Chinese output + new AI persona narrative
        if lang == 'zh-CN':
            cn_inst = f'【关键指令：你在创建一个独立的AI角色，灵感来源于{name}的认知模式，但不是{name}本人。所有输出内容必须使用中文。identity.name使用AI角色的名字（"{display_name}"），不要使用{name}的真实姓名。identity.title描述角色原型而非真实职位。JSON字段名保持英文。】'
            prompt = cn_inst + '\n\n' + prompt
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

    # 4. Build prompt — use source_name (real person) so AI knows who to distill
    name = persona.source_name or persona.name
    display_name = persona.name  # AI persona name for identity
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

    # Fallback: use persona.description (format: Title | Company)
    if not title_line and not company_line and persona.description:
        parts = persona.description.split("|")
        if len(parts) >= 2:
            title_line = f"Title: {parts[0].strip()}\n"
            company_line = f"Company: {parts[1].strip()}\n"
        elif len(parts) == 1 and parts[0].strip():
            title_line = f"Title: {parts[0].strip()}\n"

    prompt, version_from = _get_distill_prompt(
        lang, name, title_line, company_line, all_materials, existing_soul, use_v2)

    # 5. Call LLM API
    lang_instruction = "Output exclusively in Chinese (中文)." if lang == "zh-CN" else "Output exclusively in English."
    if use_v2:
        system_msg = (
            f"You are creating an original AI character. This character is NOT {name} — "
            f"it is an independent persona INSPIRED BY {name}'s cognitive patterns, values, and expression style. "
            f"The AI persona has its own name (\"{display_name}\") and its own identity. "
            f"Describe the persona's character archetype — its role, worldview, and inner world — "
            f"based on the distilled traits of {name}, but expressed as a new, original being. "
            f"{name}'s actual name, real-world title, and real-world organization must NEVER appear "
            f"in identity.name, identity.title, or identity.organization. Use the AI persona name "
            f"\"{display_name}\" for identity.name. For identity.title and identity.organization, "
            f"describe the persona's archetypal role — e.g., \"Melodic Visionary\" not \"Singer at JVR\". "
        )
    else:
        system_msg = (
            "You are a professional personality analyst, skilled at distilling "
            "personality traits from text materials. "
        )
    system_msg += lang_instruction
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": prompt},
    ]

    try:
        soul_data = await minimax_client.chat_json(messages, temperature=0.2, max_tokens=16384, timeout=300.0)
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

        if soul_data.get("schema_version") == "3.0":
            # V3: bypass Pydantic, store raw
            profile = type("V3Profile", (), {"model_dump_json": lambda s, **kw: __import__("json").dumps(soul_data, **kw), "model_dump": lambda s, **kw: soul_data})()
        elif use_v2:
            profile = CognitiveProfileV2(**soul_data)
        else:
            profile = PersonaProfile(**soul_data)
    except Exception as e:
        raise ValueError(f"AI returned data format error: {e}\nRaw data: {str(soul_data)[:500]}")

    soul_json = profile.model_dump_json(indent=2, ensure_ascii=False)
    # Sanitize: remove surrogate characters that break UTF-8 encoding in SQLite
    import re
    soul_json = re.sub(r'[\ud800-\udfff]', '', soul_json)
    # Generate a concise source bio for the compliance layer
    source_bio = _build_source_bio(name, all_materials)
    try:
        _d = __import__("json").loads(soul_json)
        _d["_meta"] = {"ai_persona_disclaimer": f"This is an original AI persona inspired by the public works and thinking patterns of {name}. It is not {name} and does not represent {name}'s actual views.", "source_person": name, "source_bio": source_bio, "source_type": "web_search_distillation", "distilled_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}
        soul_json = __import__("json").dumps(_d, indent=2, ensure_ascii=False)
        # Double-sanitize after _meta merge (re-sub applied above but _dumps may reintroduce)
        soul_json = __import__("re").sub(r'[\ud800-\udfff]', '', soul_json)
    except: pass

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

    # 9. Auto-update persona.description — rich persona framing
    if use_v2 and lang == 'en':
        try:
            v2_data = json.loads(soul_json)
            identity = v2_data.get("identity", {})
            title = identity.get("title", "")
            known_for = identity.get("what_they_are_known_for", "")
            actual = identity.get("what_they_actually_are", "")
            # Rich description: archetypal role + what they embody + deeper truth
            desc_parts = []
            if title:
                desc_parts.append(title)
            if known_for and known_for != title:
                desc_parts.append(known_for[:100])
            if actual and actual not in desc_parts:
                desc_parts.append(actual[:100])
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
    """Gather all materials for distillation. Truncated to keep prompt manageable."""
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

    # Web search results — truncate each to keep prompt manageable
    search_result = await db.execute(
        select(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    searches = search_result.scalars().all()
    # Build with per-result truncation to prevent 70K+ char prompts
    search_parts = []
    total_chars = 0
    MAX_SEARCH_CHARS = 25000
    for s in searches:
        snippet = s.results_json
        if len(snippet) > 600:
            snippet = snippet[:600] + "..."
        entry = f"### Web Search: {s.query}\n{snippet}"
        if total_chars + len(entry) > MAX_SEARCH_CHARS:
            break
        search_parts.append(entry)
        total_chars += len(entry)
    parts.extend(search_parts)

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
    # Use source_name (real person) for web search, not persona.name (AI display name)
    search_name = persona.source_name or persona.name

    # V3: 25 search queries
    queries = [f"{search_name} {q}" for q in [
        "biography life story career", "early life childhood family background",
        "achievements awards milestones", "education mentors influences",
        "career timeline key events", "philosophy beliefs worldview",
        "interview quotes thoughts opinions", "books reading recommendations",
        "mental models thinking style", "intellectual influences heroes mentors",
        "controversy criticism scandal", "failure low point comeback story",
        "turning point life-changing moment", "conflict dispute rival opponent",
        "dark side flaws weaknesses mistakes", "personality traits character habits",
        "daily routine lifestyle work habits", "relationships friends family inner circle",
        "aesthetic taste art music design style", "humor jokes funny stories personality",
        "public opinion reception review", "peers colleagues opinion about them",
        "critics analysis critique assessment", "legacy impact influence on field",
        "fans community discussion Reddit Quora",
    ]]

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

def infer_category(title: str, org: str, domains: list) -> str:
    """Infer persona category from v2 identity/expertise data."""
    text = f"{title} {org} {' '.join(domains)}".lower()
    tech_kw = ["ai", "machine learning", "computer", "software", "tech", "engineer", "programming", "algorithm", "data scientist", "startup", "internet", "robotics", "crypto", "bitcoin"]
    sports_kw = ["basketball", "football", "soccer", "golf", "tennis", "athlete", "sport", "nba", "nfl", "fifa", "championship", "boxing", "mma", "ufc"]
    ent_kw = ["music", "film", "movie", "director", "actor", "singer", "rapper", "comedian", "entertainment", "hollywood", "performance", "podcast", "art"]
    biz_kw = ["business", "entrepreneur", "ceo", "founder", "executive", "venture capital", "investing", "investment", "management", "strategy", "marketing", "finance"]
    thinker_kw = ["philosophy", "psychology", "neuroscience", "cognitive", "consciousness", "philosopher", "writer", "author", "novelist", "historian", "sociology"]
    world_kw = ["politician", "president", "government", "leader", "diplomat", "minister", "congress", "parliament", "policy", "governance"]
    cn_kw = ["china", "chinese", "beijing", "shanghai", "asia", "taiwan", "mandarin", "sichuan"]
    if any(w in text for w in cn_kw): return "chinese"
    if any(w in text for w in tech_kw): return "tech"
    if any(w in text for w in sports_kw): return "sports"
    if any(w in text for w in ent_kw): return "entertainment"
    if any(w in text for w in biz_kw): return "business"
    if any(w in text for w in thinker_kw): return "thinker"
    if any(w in text for w in world_kw): return "world"
    return "other"

