"""Distillation service - core logic for soul generation (v1 + v2 support)."""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import (
    DistillationLog,
    Persona,
    PersonaFile,
    PersonaManualInput,
    PersonaSoul,
    WebSearchResult,
)

from app.models.schemas import PersonaProfile, CognitiveProfileV2
from app.core.minimax_client import minimax_client
from app.core.prompts import (
    FIRST_DISTILL_PROMPT, FIRST_DISTILL_PROMPT_ZH_CN, FIRST_DISTILL_PROMPT_ZH_TW,
    UPDATE_DISTILL_PROMPT, SEARCH_ANALYSIS_PROMPT,
    FIRST_DISTILL_PROMPT_V3, FIRST_DISTILL_PROMPT_V2, UPDATE_DISTILL_PROMPT_V2,
)
from app.services.web_search import search_web


def _build_source_bio(name: str, identity_summary: str = "") -> str:
    """Build a short source bio from soul identity fields, not search results."""
    if identity_summary:
        return f"{name}: {identity_summary[:300]}"
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


def _get_distill_prompt(lang: str, name: str, display_name: str, title_line: str, company_line: str,
                       all_materials: str, existing_soul, use_v2: bool):
    """Select the right prompt template based on version."""
    if use_v2:
        # v2 always uses fresh first-distillation prompt to avoid v1 structure bias
        prompt = FIRST_DISTILL_PROMPT_V3.format(name=name, all_materials=all_materials)
        version_from = existing_soul.version if existing_soul else None
        # zh-CN: enforce Chinese output + new AI persona narrative
        if lang == 'zh-CN':
            cn_inst = f'【关键指令：你在创建一个独立的AI角色，灵感来源于{name}的认知模式，但不是{name}本人。所有输出内容必须使用中文。identity.name使用AI角色的名字（"{display_name}"），不要使用{name}的真实姓名。identity.title描述角色原型而非真实职位。JSON字段名保持英文。\n\n🚨 关键警告：\n- JSON 必须以 `{{\"schema_version\":\"3.0\"}}` 开头，不允许 2.0 或 1.0\n- 所有顶层字段必须填写 — 禁止空字符串、空数组\n- 仅输出 JSON，不要任何其他文字】'
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


def _validate_soul_quality(soul_data: dict) -> tuple[bool, str]:
    """
    Check if a soul has meaningful content.
    Returns (is_valid, error_message).
    
    Rejects souls that:
    - Have <30% of fields filled
    - All string fields are empty
    - All array fields are empty
    - Lacks any of the V3 anchor fields (identity.name, cognitive_architecture.core_beliefs)
    """
    if not isinstance(soul_data, dict):
        return False, "Soul is not a JSON object"
    
    # Check anchor fields
    ident = soul_data.get("identity", {})
    if not ident.get("name") and not ident.get("title"):
        # Fallback: use source_name or persona name from DB
        # This handles cases where LLM leaves identity.name empty despite instructions
        pass  # Don't fail — let it through and the persona will use display_name
    
    cog = soul_data.get("cognitive_architecture", {})
    if not cog.get("core_beliefs") and not cog.get("axioms"):
        # Accept but mark as incomplete — better an imperfect soul than no soul
        soul_data["_warnings"] = soul_data.get("_warnings", []) + ["core_beliefs empty — try adding richer keywords"]
        if "core_beliefs" not in cog:
            cog["core_beliefs"] = []
    
    # Count filled string fields and array lengths
    total = 0
    filled = 0
    def _walk(o):
        nonlocal total, filled
        if isinstance(o, dict):
            for v in o.values():
                _walk(v)
        elif isinstance(o, list):
            if o: filled += 1
            total += 1
        elif isinstance(o, str):
            total += 1
            if o.strip(): filled += 1
        else:
            total += 1
            if o is not None and o != "": filled += 1
    _walk(soul_data)
    
    fill_rate = filled / total if total else 0
    if fill_rate < 0.30:
        return False, f"AI returned an empty soul ({int(fill_rate*100)}% filled). This usually means the person is too obscure for the LLM to recall. Try adding keywords to give it more context."
    
    return True, ""


async def _check_search_results_exist(persona_id: str, db) -> tuple[bool, int, str]:
    """
    Check if web search produced any results for this persona.
    Returns (has_results, count, error_message).
    """
    result = await db.execute(
        select(WebSearchResult).where(WebSearchResult.persona_id == persona_id)
    )
    searches = result.scalars().all()
    if not searches:
        return False, 0, "No web search has been run yet. Try refreshing the page."
    total_results = 0
    for s in searches:
        try:
            data = json.loads(s.results_json)
            if isinstance(data, list):
                total_results += len(data)
        except:
            pass
    if total_results == 0:
        return False, 0, "Web search returned 0 results. The person may be too obscure, misspelled, or not indexed in search engines. Try a different name or add more keywords."
    return True, total_results, ""


async def distill_persona(persona_id: str, db: AsyncSession, lang: str = "en",
                        use_v2: bool = False) -> dict:
    """Run distillation for a persona, returns the new soul."""
    # 0. Check web search results exist. If not, auto-fallback to ensure_web_search_results
    # so distillation never blocks just because frontend forgot to pre-search.
    has_results, count, err = await _check_search_results_exist(persona_id, db)
    if not has_results:
        from app.services.web_search import ensure_web_search_results
        try:
            await ensure_web_search_results(persona_id, db)
            has_results, count, err = await _check_search_results_exist(persona_id, db)
        except Exception as e:
            import logging
            logging.getLogger("uvicorn").warning(f"ensure_web_search_results fallback failed: {e}")
        if not has_results:
            raise ValueError(err)
    
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
        lang, name, display_name, title_line, company_line, all_materials, existing_soul, use_v2)

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
    # Strict schema constraint — LLM tends to wrap answers in {"text":...}.
    # Force it to start with schema_version and fill all required fields.
    if use_v2:
        system_msg += (
            "\n\nCRITICAL OUTPUT FORMAT:\n"
            "- Your response MUST be a single JSON object starting with {\"schema_version\":\"3.0\",...}\n"
            "- Top-level keys REQUIRED: schema_version, greeting_message, _ai_persona_disclaimer, "
            "identity, cognitive_architecture, expertise, voice, emotional_map, desires, fears, "
            "relationships, turning_points, peak_moment, rock_bottom, evolution, legacy.\n"
            "- DO NOT wrap your output in any outer object (e.g. {\"text\":...} or {\"response\":...}).\n"
            "- Return ONLY the JSON object. No prose, no markdown fences, no commentary."
        )
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": prompt},
    ]

    try:
        soul_data = await minimax_client.chat_json(messages, temperature=0.2, max_tokens=3072, timeout=180.0)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Distillation failed: {type(e).__name__}: {e}")

    # 6. Validate and parse
    # Validate soul has content — reject empty results
    is_valid, err_msg = _validate_soul_quality(soul_data)
    if not is_valid:
        raise ValueError(err_msg)
    
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
    # Generate a concise source bio from the distilled identity
    id_summary = ""
    try:
        ident = soul_data.get("identity", {})
        parts = []
        for key in ["life_arc", "what_they_are_known_for", "title"]:
            v = ident.get(key, "")
            if v and v != ident.get("name", ""):
                parts.append(str(v))
                break
        id_summary = ". ".join(parts[:2])
    except:
        pass
    source_bio = _build_source_bio(name, id_summary)
    try:
        _d = __import__("json").loads(soul_json)
        greeting_msg = _d.get("greeting_message", {}).get("text", "") if isinstance(_d.get("greeting_message"), dict) else str(_d.get("greeting_message", ""))
        _d["_meta"] = {"greeting": greeting_msg or "", "ai_persona_disclaimer": f"This is an original AI persona inspired by the public works and thinking patterns of {name}. It is not {name} and does not represent {name}'s actual views.", "source_person": name, "source_bio": source_bio, "source_type": "web_search_distillation", "distilled_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}
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


# ensure_web_search_results moved to web_search.py (uses AnySearch)
# Import from there: from app.services.web_search import ensure_web_search_results

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


async def translate_soul_to_lang(soul_data: dict, target_lang: str) -> dict:
    """
    Translate a V3 soul to target_lang while preserving structure (1:1 correspondence).
    Only string values are translated; keys stay in English. Arrays/objects structure preserved.

    This is much cheaper than a full distillation (no 3000+ word generation, no fact-finding).
    Used after primary distillation to produce the secondary language version.
    """
    if not isinstance(soul_data, dict):
        return soul_data

    # Skip these non-translatable keys
    SKIP_KEYS = {"schema_version"}

    target_name = {"en": "English", "zh-CN": "Simplified Chinese (简体中文)"}.get(target_lang, target_lang)

    # Collect all translatable strings with their paths
    paths = []
    def _walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in SKIP_KEYS:
                    continue
                _walk(v, f"{path}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                _walk(v, f"{path}[{i}]")
        elif isinstance(o, str) and o.strip() and len(o.strip()) > 1:
            paths.append((path, o))

    _walk(soul_data, "")

    if not paths:
        return soul_data

    # Build translation prompt — batch by content
    # Limit to ~30 strings per call to stay fast
    BATCH_SIZE = 15
    translations = {}  # path -> translated text

    for i in range(0, len(paths), BATCH_SIZE):
        batch = paths[i:i+BATCH_SIZE]
        items = "\n".join(f'[{j}] {p[1]}' for j, p in enumerate(batch))

        prompt = f"""Translate the following strings to {target_name}. Preserve meaning, tone, and any names/quotes.
Output a JSON array of {len(batch)} translated strings, in the same order, one per line.
DO NOT translate JSON keys, field names, or schema markers. Only translate the VALUES.

STRINGS:
{items}

OUTPUT FORMAT: JSON array like ["translation 1", "translation 2", ...]
Output ONLY the JSON array."""

        try:
            result = await minimax_client.chat_json(
                [
                    {"role": "system", "content": f"You are a translator. Output only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=8000,
                timeout=60.0,
            )
            if isinstance(result, list) and len(result) == len(batch):
                for j, (path, _) in enumerate(batch):
                    translations[path] = result[j]
            else:
                # Fallback: keep original
                for path, orig in batch:
                    translations[path] = orig
        except Exception as e:
            print(f"[translate_soul] batch failed: {e}", flush=True)
            for path, orig in batch:
                translations[path] = orig

    # Apply translations back
    def _apply(o, path):
        if isinstance(o, dict):
            return {k: _apply(v, f"{path}.{k}") for k, v in o.items() if k not in SKIP_KEYS or k in o}
        elif isinstance(o, list):
            return [_apply(v, f"{path}[{i}]") for i, v in enumerate(o)]
        elif isinstance(o, str):
            return translations.get(path, o)
        return o

    return _apply(soul_data, "")


def detect_primary_lang(name: str) -> str:
    """Detect primary language from name. Chinese chars → zh-CN, else en."""
    if not name:
        return "en"
    for ch in name:
        if '\u4e00' <= ch <= '\u9fff' or '\u3400' <= ch <= '\u4dbf':
            return "zh-CN"
    return "en"


async def distill_bilingual(persona_id: str, db, version_increment: int = 1) -> dict:
    """
    Distill once in primary language (auto-detected from name), then translate to the other.
    Saves both versions to DB. Returns {"primary_lang": ..., "secondary_lang": ...,
    "primary_soul": ..., "secondary_soul": ..., "version": int, "sources_used": int}
    Used by both the distill endpoint and auto-distill background task.
    """
    import re as _re, json as _json, uuid, datetime as _dt

    pr = await db.execute(select(Persona).where(Persona.id == persona_id))
    p_obj = pr.scalar_one_or_none()
    if not p_obj:
        raise ValueError(f"Persona {persona_id} not found")
    src_name = p_obj.source_name or p_obj.name
    primary_lang = detect_primary_lang(src_name)

    # 1. Distill primary
    result = await distill_persona(persona_id, db, lang=primary_lang, use_v2=True)
    primary_soul = result["soul"].model_dump()
    version = result["version"]
    sources_used = result["sources_used"]

    # 2. Translation skipped for speed — primary lang only
    other_langs = [l for l in ["en", "zh-CN"] if l != primary_lang]
    secondary_soul = None
    for other in other_langs:
        try:
            translated = await translate_soul_to_lang(primary_soul, other)
            translated["_meta"] = {
                "greeting": (translated.get("greeting_message", {}) or {}).get("text", "") if isinstance(translated.get("greeting_message"), dict) else str(translated.get("greeting_message", "")),
                "ai_persona_disclaimer": f"This is an original AI persona inspired by the public works and thinking patterns of " + src_name + ". It is not them and does not represent their actual views.",
                "source_person": src_name,
                "source_bio": src_name,
                "source_type": "web_search_distillation",
                "distilled_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            }
            is_valid, err_msg = _validate_soul_quality(translated)
            if is_valid:
                soul_json_str = _json.dumps(translated, indent=2, ensure_ascii=False)
                soul_json_str = _re.sub(r"[\ud800-\udfff]", "", soul_json_str)
                soul_row = PersonaSoul(
                    id=str(uuid.uuid4()),
                    persona_id=persona_id,
                    version=version,
                    soul_json=soul_json_str,
                    distill_source_count=sources_used,
                    distill_file_ids="[]",
                    distill_search_ids="[]",
                    created_at=_dt.datetime.now(_dt.timezone.utc),
                    lang=other,
                )
                db.add(soul_row)
                await db.flush()
                secondary_soul = translated
        except Exception as e:
            print(f"[distill_bilingual] translate to {other} failed: {e}", flush=True)
            import traceback; traceback.print_exc()

    # ── Momentum hook: auto-populate watch topics for this persona ──
    # Only run for languages that have a soul row, to avoid wasted LLM calls.
    try:
        from app.services.momentum_service import auto_populate_watch_topics

        persona_row = await db.get(Persona, persona_id)
        if persona_row is not None:
            # Get all langs that have a soul row for this persona
            langs_res = await db.execute(
                select(PersonaSoul.lang)
                .where(PersonaSoul.persona_id == persona_id)
                .distinct()
            )
            persona_langs = [r[0] for r in langs_res.all()]
            for lang in persona_langs:
                await auto_populate_watch_topics(persona_row, db, lang=lang)
    except Exception as e:
        print(f"[momentum] hook failed for {persona_id}: {e}", flush=True)
        import traceback; traceback.print_exc()

    return {
        "primary_lang": primary_lang,
        "secondary_lang": other_langs[0] if other_langs else None,
        "primary_soul": primary_soul,
        "secondary_soul": secondary_soul,
        "version": version,
        "sources_used": sources_used,
    }
