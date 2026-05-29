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
from app.core.auth_deps import require_auth, require_premium

router = APIRouter(prefix="/personas", tags=["Personas"])


@router.post("", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
async def create_persona(data: PersonaCreate, db: AsyncSession = Depends(get_db), user_id: str = None):
    persona = await persona_service.create_persona(data, db, user_id=user_id)
    # Set default DiceBear avatar if none provided
    if not persona.avatar_url:
        persona.avatar_url = generate_avatar_url(persona.name)
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
async def list_personas(db: AsyncSession = Depends(get_db), user_id: str = None):
    return await persona_service.list_personas(db, user_id=user_id, include_presets=True)


@router.get("/presets", response_model=list[PersonaOut])
async def list_presets(db: AsyncSession = Depends(get_db)):
    """List preset personas (user_id=NULL) for the Discover tab."""
    return await persona_service.list_personas(db, user_id=None, include_presets=True)


@router.get("/{persona_id}", response_model=PersonaDetail)
async def get_persona(persona_id: str, user = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    result = await persona_service.get_persona(persona_id, db, user_id=user.id)
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
