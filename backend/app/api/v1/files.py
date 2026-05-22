"""File upload & management API routes."""

import uuid
import os
import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.config import get_settings
from app.models.db_models import PersonaFile
from app.models.schemas import FileOut, UploadResponse
from app.services.file_parser import parse_file, parse_url, allowed_file
from app.services.persona_service import get_persona

router = APIRouter(prefix="/personas/{persona_id}/files", tags=["Files"])

settings = get_settings()


def _now():
    return datetime.now(timezone.utc)


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_files(
    persona_id: str,
    files: list[UploadFile] = File(...),
    urls: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
):
    # Verify persona exists
    persona = await get_persona(persona_id, db)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    upload_batch = str(uuid.uuid4())
    upload_dir = Path(settings.UPLOAD_DIR) / persona_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_outs = []

    # Process uploaded files
    for file in files:
        if not file.filename:
            continue
        if not allowed_file(file.filename):
            file_outs.append(FileOut(
                id=str(uuid.uuid4()),
                persona_id=persona_id,
                file_name=file.filename,
                file_type=Path(file.filename).suffix,
                file_size=0,
                parsed_content=f"[File format not supported: {Path(file.filename).suffix}]",
                upload_batch=upload_batch,
                created_at=_now(),
            ))
            continue

        file_id = str(uuid.uuid4())
        file_ext = Path(file.filename).suffix
        saved_name = f"{file_id}{file_ext}"
        file_path = upload_dir / saved_name

        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        parsed = await parse_file(str(file_path), file_ext)

        now = _now()
        db_file = PersonaFile(
            id=file_id,
            persona_id=persona_id,
            file_name=file.filename,
            file_path=str(file_path),
            file_type=file_ext,
            file_size=len(contents),
            parsed_content=parsed,
            upload_batch=upload_batch,
            created_at=now,
        )
        db.add(db_file)
        file_outs.append(FileOut(
            id=db_file.id,
            persona_id=db_file.persona_id,
            file_name=db_file.file_name,
            file_type=db_file.file_type,
            file_size=db_file.file_size,
            parsed_content=db_file.parsed_content,
            upload_batch=db_file.upload_batch,
            created_at=now,
        ))

    # Process URLs
    url_list = json.loads(urls)
    for url in url_list:
        if not url.strip():
            continue
        file_id = str(uuid.uuid4())
        parsed = await parse_url(url)
        now = _now()
        db_file = PersonaFile(
            id=file_id,
            persona_id=persona_id,
            file_name=url,
            file_path=url,
            file_type="url",
            file_size=len(parsed),
            parsed_content=parsed,
            upload_batch=upload_batch,
            created_at=now,
        )
        db.add(db_file)
        file_outs.append(FileOut(
            id=db_file.id,
            persona_id=db_file.persona_id,
            file_name=db_file.file_name,
            file_type=db_file.file_type,
            file_size=db_file.file_size,
            parsed_content=db_file.parsed_content,
            upload_batch=db_file.upload_batch,
            created_at=now,
        ))

    await db.flush()
    return UploadResponse(upload_id=upload_batch, files=file_outs)


@router.get("", response_model=list[FileOut])
async def list_files(persona_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PersonaFile)
        .where(PersonaFile.persona_id == persona_id)
        .order_by(PersonaFile.created_at.desc())
    )
    files = result.scalars().all()
    return [
        FileOut(
            id=f.id, persona_id=f.persona_id,
            file_name=f.file_name, file_type=f.file_type,
            file_size=f.file_size, parsed_content=f.parsed_content,
            upload_batch=f.upload_batch, created_at=f.created_at,
        ) for f in files
    ]


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(persona_id: str, file_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PersonaFile)
        .where(PersonaFile.id == file_id, PersonaFile.persona_id == persona_id)
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    if db_file.file_path and db_file.file_type != "url":
        try:
            os.remove(db_file.file_path)
        except OSError:
            pass

    await db.delete(db_file)
    await db.flush()
