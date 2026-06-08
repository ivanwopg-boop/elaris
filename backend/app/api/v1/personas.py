"""Persona CRUD API routes."""

import os, uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
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
    persona = await persona_service.create_persona(data, db, user_id=user.id)
    # Set default DiceBear avatar if none provided
    if not persona.avatar_url:
        persona.avatar_url = generate_avatar_url(persona.name)
        await db.flush()

    # If source_id provided, copy soul (PersonaSoul) from source persona
    if data.source_id:
        from sqlalchemy import select, update
        from app.models.db_models import PersonaSoul
        # Copy latest soul version from source
        src_soul = await db.execute(
            select(PersonaSoul).where(PersonaSoul.persona_id == data.source_id).order_by(PersonaSoul.version.desc())
        )
        src = src_soul.scalars().first()
        if src:
            from datetime import datetime
            new_soul = PersonaSoul(
                id=str(uuid.uuid4()),
                persona_id=persona.id,
                soul_json=src.soul_json,
                version=1,
                created_at=datetime.utcnow(),
            )
            db.add(new_soul)
            # Also copy files
            from app.models.db_models import PersonaFile
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
            await db.flush()

    return PersonaOut(
        id=persona.id,
        name=persona.name,
        description=persona.description,
        avatar_url=persona.avatar_url,
        created_at=persona.created_at,
        updated_at=persona.updated_at,
    )


@router.get("", response_model=list[PersonaOut])
async def list_personas(user: User = Depends(require_auth_optional), db: AsyncSession = Depends(get_db)):
    return await persona_service.list_personas(db, user_id=user.id if user else None, include_presets=True)


@router.get("/presets", response_model=list[PersonaOut])
async def list_presets(db: AsyncSession = Depends(get_db)):
    """List preset personas (user_id=NULL) for the Discover tab."""
    return await persona_service.list_personas(db, user_id=None, include_presets=True)


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


DEFAULT_AVATAR_URL = "https://api.dicebear.com/9.x/notionists/svg?seed="


def generate_avatar_url(name: str) -> str:
    """Generate a DiceBear avatar URL based on persona name."""
    return f"{DEFAULT_AVATAR_URL}{name}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf"


@router.delete("/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(persona_id: str, user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    deleted = await persona_service.delete_persona(persona_id, db, user_id=user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Persona not found or access denied")
