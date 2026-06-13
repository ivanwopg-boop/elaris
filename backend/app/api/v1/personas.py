"""Persona CRUD API routes."""

import asyncio

import os, uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.schemas import PersonaCreate, PersonaUpdate, PersonaOut, PersonaDetail
from app.models.db_models import Persona, User
from app.services import persona_service
from app.config import get_settings
from app.core.auth_deps import require_auth, require_auth_optional, require_premium

router = APIRouter(prefix="/personas", tags=["Personas"])


@router.post("", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
async def create_persona(data: PersonaCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_auth)):
    if not user.id: raise HTTPException(status_code=400, detail="User ID is required")
    if user.tier == "restricted":
        raise HTTPException(status_code=403, detail="Persona creation is not available for restricted accounts. Please verify your age to unlock.")
    persona = await persona_service.create_persona(data, db, user_id=user.id)
    # Set default DiceBear avatar if none provided
    if not persona.avatar_url:
        persona.avatar_url = generate_avatar_url(persona.name)
        await db.flush()

    # Auto-trigger distillation in background (no await — user gets persona immediately)
    async def _auto_distill():
        from app.database import async_session
        async with async_session() as _db:
            from app.services.web_search import ensure_web_search_results
            from app.services.distill_service import distill_persona
            import logging
            _log = logging.getLogger("uvicorn")
            try:
                await ensure_web_search_results(persona.id, _db)
                # Bilingual distill: primary + translate. Guarantees 1:1 correspondence.
                from app.services.distill_service import distill_bilingual
                await distill_bilingual(persona.id, _db)
                await _db.commit()
                _log.info(f"Auto-distill complete for {persona.id}")
            except Exception as e:
                _log.error(f"Auto-distill failed for {persona.id}: {e}")
    asyncio.create_task(_auto_distill())

    # If source_id provided, copy souls + files + web search results from source persona.
    # IMPORTANT: copy the LATEST soul for EACH language so the cloned persona is bilingual,
    # not just the single most-recently-created soul row.
    if data.source_id:
        from sqlalchemy import select
        from app.models.db_models import PersonaSoul, PersonaFile, WebSearchResult
        from datetime import datetime

        # 1. Copy latest soul per lang (en, zh-CN) — preserves bilingual coverage.
        src_souls = await db.execute(
            select(PersonaSoul)
            .where(PersonaSoul.persona_id == data.source_id)
            .order_by(PersonaSoul.lang, PersonaSoul.version.desc())
        )
        src_soul_rows = src_souls.scalars().all()
        seen_langs = set()
        for ss in src_soul_rows:
            # Keep only the highest-version row per lang
            if ss.lang in seen_langs:
                continue
            seen_langs.add(ss.lang)
            new_soul = PersonaSoul(
                id=str(uuid.uuid4()),
                persona_id=persona.id,
                lang=ss.lang,                 # <- critical: preserve the original lang
                version=1,
                soul_json=ss.soul_json,
                distill_source_count=ss.distill_source_count,
                distill_file_ids=ss.distill_file_ids,
                distill_search_ids=ss.distill_search_ids,
                created_at=datetime.utcnow(),
            )
            db.add(new_soul)

        # 2. Copy files
        src_files = await db.execute(select(PersonaFile).where(PersonaFile.persona_id == data.source_id))
        for sf in src_files.scalars().all():
            new_file = PersonaFile(
                id=str(uuid.uuid4()),
                persona_id=persona.id,
                file_name=sf.file_name,
                file_type=sf.file_type,
                file_size=sf.file_size,
                parsed_content=sf.parsed_content,
                upload_batch=sf.upload_batch,
                created_at=datetime.utcnow(),
            )
            db.add(new_file)

        # 3. Copy web search results so the next distillation has the same context.
        src_searches = await db.execute(select(WebSearchResult).where(WebSearchResult.persona_id == data.source_id))
        for sw in src_searches.scalars().all():
            new_search = WebSearchResult(
                id=str(uuid.uuid4()),
                persona_id=persona.id,
                query=sw.query,
                results_json=sw.results_json,
                search_batch=sw.search_batch,
                created_at=datetime.utcnow(),
            )
            db.add(new_search)

        await db.flush()

    return PersonaOut(
        id=persona.id,
        name=persona.name,
        category=persona.category,
        source_name=persona.source_name,
        description=persona.description,
        avatar_url=persona.avatar_url,
        created_at=persona.created_at,
        updated_at=persona.updated_at,
    )


@router.get("", response_model=list[PersonaOut])
async def list_personas(lang: str = Query("en"), user: User = Depends(require_auth_optional), db: AsyncSession = Depends(get_db)):
    return await persona_service.list_personas(db, user_id=user.id if user else None, include_presets=True, lang=lang)


@router.get("/presets", response_model=list[PersonaOut])
async def list_presets(lang: str = Query("en"), user: User = Depends(require_auth_optional), db: AsyncSession = Depends(get_db)):
    """List preset personas (user_id=NULL) for the Discover tab — exclude current user's own personas."""
    return await persona_service.list_personas(db, user_id=None, include_presets=True, lang=lang)


@router.post("/contacts/{persona_id}")
async def add_contact(persona_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Add a preset persona to the current user's contacts."""
    from app.models.db_models import Contact, Persona
    from sqlalchemy import select
    # Verify persona exists
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Persona not found")
    # Check if already in contacts
    existing = await db.execute(select(Contact).where(Contact.user_id == user.id, Contact.persona_id == persona_id))
    if existing.scalar_one_or_none():
        return {"ok": True, "message": "Already in contacts"}
    # Create contact link
    contact = Contact(id=str(uuid.uuid4()), user_id=user.id, persona_id=persona_id)
    db.add(contact)
    await db.commit()
    return {"ok": True}

from app.models.db_models import User


@router.delete("/contacts/{persona_id}")
async def remove_contact(persona_id: str, user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Remove a persona from the current user's contacts."""
    from app.models.db_models import Contact
    from sqlalchemy import delete
    await db.execute(delete(Contact).where(Contact.user_id == user.id, Contact.persona_id == persona_id))
    await db.commit()
    return {"ok": True}


@router.get("/contacts", response_model=list[PersonaOut])
async def list_contacts(user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """List all contacts for the current user."""
    from app.models.db_models import Contact, Persona
    from sqlalchemy import select
    result = await db.execute(
        select(Persona).join(Contact, Contact.persona_id == Persona.id).where(Contact.user_id == user.id)
    )
    personas = result.scalars().all()
    return [PersonaOut(
        id=p.id, name=p.name, description=p.description,
        avatar_url=p.avatar_url, created_at=p.created_at, updated_at=p.updated_at
    ) for p in personas]


@router.delete("/presets/{persona_id}")
async def delete_preset(persona_id: str, user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Delete a preset persona from Discover tab."""
    from app.models.db_models import Persona
    from sqlalchemy import select, delete
    result = await db.execute(select(Persona).where(Persona.id == persona_id, Persona.user_id == None))
    preset = result.scalar_one_or_none()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    await db.execute(delete(Persona).where(Persona.id == persona_id))
    await db.commit()
    return {"ok": True}


@router.get("/{persona_id}", response_model=PersonaDetail)
async def get_persona(persona_id: str, user: User | None = Depends(require_auth_optional), db: AsyncSession = Depends(get_db)):
    result = await persona_service.get_persona(persona_id, db, user_id=user.id if user else None)
    if not result:
        raise HTTPException(status_code=404, detail="Persona not found")
    return PersonaDetail(**result)


@router.put("/{persona_id}", response_model=PersonaOut)
async def update_persona(persona_id: str, data: PersonaUpdate, user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    persona = await persona_service.update_persona(persona_id, data, db, user_id=user.id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return PersonaOut(
        id=persona.id,
        name=persona.name,
        category=persona.category,
        source_name=persona.source_name,
        description=persona.description,
        avatar_url=persona.avatar_url,
        created_at=persona.created_at,
        updated_at=persona.updated_at,
    )


@router.post("/{persona_id}/avatar", status_code=status.HTTP_200_OK)
async def upload_avatar(
    persona_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Upload avatar image for a persona."""
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.user_id is not None and persona.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your persona")

    settings = get_settings()
    avatar_dir = Path(settings.UPLOAD_DIR) / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix if file.filename else ".png"
    filename = f"{persona_id}{ext}"
    filepath = avatar_dir / filename

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    persona.avatar_url = f"/uploads/avatars/{filename}"
    await db.flush()
    return {"avatar_url": persona.avatar_url}


DEFAULT_AVATAR_URL = "https://api.dicebear.com/9.x/shapes/svg?seed="


def generate_avatar_url(name: str) -> str:
    """Generate a DiceBear avatar URL based on persona name."""
    return f"{DEFAULT_AVATAR_URL}{name}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf"


@router.delete("/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(persona_id: str, user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    deleted = await persona_service.delete_persona(persona_id, db, user_id=user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Persona not found or access denied")
