"""Persona business logic service."""

import json
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.db_models import Persona, PersonaSoul
from app.models.schemas import PersonaCreate, PersonaUpdate


async def create_persona(data: PersonaCreate, db: AsyncSession, user_id: str | None = None) -> Persona:
    persona = Persona(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=data.name,
        description=data.description,
        avatar_url=data.avatar_url,
        category=data.category or "other",
    )
    db.add(persona)
    await db.flush()
    return persona


async def get_persona(persona_id: str, db: AsyncSession, user_id: str | None = None) -> dict | None:
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        return None
    # Ownership check: if user_id provided, ensure user owns this persona (or it's a preset)
    if user_id is not None and persona.user_id is not None and persona.user_id != user_id:
        return None
    # Allow premium users to access preset personas (user_id=NULL)

    # Get latest soul (any lang, version desc)
    soul_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    soul = soul_result.scalars().first()

    # Get souls_by_lang - one per language
    all_souls_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    all_souls = all_souls_result.scalars().all()
    souls_by_lang = {}
    for s in all_souls:
        if s.lang not in souls_by_lang:
            try:
                soul_data = json.loads(s.soul_json)
            except Exception:
                soul_data = {}
            souls_by_lang[s.lang] = {
                "version": s.version,
                "has_soul": True,
                "soul": soul_data,
            }
    # Ensure all 3 langs are present (even if missing)
    for lang in ["en", "zh-CN"]:
        if lang not in souls_by_lang:
            souls_by_lang[lang] = {"version": 0, "has_soul": False, "soul": None}

    # Get file count
    from app.models.db_models import PersonaFile
    file_count_result = await db.execute(
        select(PersonaFile).where(PersonaFile.persona_id == persona_id)
    )
    file_count = len(file_count_result.scalars().all())

    return {
        "id": persona.id,
        "name": persona.name,
        "description": persona.description,
        "avatar_url": persona.avatar_url,
        "created_at": persona.created_at,
        "updated_at": persona.updated_at,
        "has_soul": soul is not None,
            "category": persona.category,
        "soul": json.loads(soul.soul_json) if soul else None,
        "soul_version": soul.version if soul else None,
        "file_count": file_count,
        "souls_by_lang": souls_by_lang,
    }


async def list_personas(db: AsyncSession, user_id: str | None = None, include_presets: bool = False, lang: str = "en") -> list[dict]:
    query = select(Persona)
    if user_id:
        if include_presets:
            query = query.where((Persona.user_id == user_id) | (Persona.user_id == None))  # noqa: E711
        else:
            query = query.where(Persona.user_id == user_id)
    elif include_presets:
        query = query.where(Persona.user_id == None)  # noqa: E711
    else:
        pass  # no filter, return all (for admin/public listing)
    query = query.order_by(Persona.created_at.desc())
    result = await db.execute(query)
    personas = result.scalars().all()

    out = []
    for p in personas:
        soul_result = await db.execute(
            select(PersonaSoul)
            .where(PersonaSoul.persona_id == p.id, PersonaSoul.lang == lang)
            .order_by(PersonaSoul.version.desc())
        )
        soul = soul_result.scalars().first()
        # Compute lang-specific description from soul
        lang_desc = p.description
        if soul:
            try:
                import json
                d = json.loads(soul.soul_json)
                ident = d.get("identity", {}) or d.get("basic_info", {})
                title = ident.get("title", "") or ""
                org = ident.get("organization", "") or ident.get("company", "") or ""
                parts = []
                if title:
                    parts.append(title)
                if org:
                    parts.append(org)
                if parts:
                    lang_desc = " | ".join(parts)
            except:
                pass

        out.append({
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "source_name": p.source_name,
            "description": lang_desc,
            "avatar_url": p.avatar_url,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "has_soul": soul is not None,
            "category": p.category,
        })
    return out


async def update_persona(persona_id: str, data: PersonaUpdate, db: AsyncSession, user_id: str | None = None) -> Persona | None:
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        return None
    if user_id is not None and persona.user_id is not None and persona.user_id != user_id:
        return None
    if data.name is not None:
        persona.name = data.name
    if data.description is not None:
        persona.description = data.description
    if data.avatar_url is not None:
        persona.avatar_url = data.avatar_url
    await db.flush()
    return persona


async def delete_persona(persona_id: str, db: AsyncSession, user_id: str | None = None) -> bool:
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        return False
    if user_id is not None and persona.user_id is not None and persona.user_id != user_id:
        return False
    await db.delete(persona)
    await db.flush()
    return True
