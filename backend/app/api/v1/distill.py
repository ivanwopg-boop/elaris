"""Distillation & web search API routes."""

import uuid
import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth_deps import require_auth
from app.database import get_db_with_retry as get_db, async_session
from app.models.db_models import Persona, WebSearchResult, PersonaSoul, PersonaManualInput, User
from app.models.schemas import (
    WebSearchRequest, WebSearchResultOut,
    DistillResponse, SoulOut, ManualInputCreate, ManualInputOut,
)
from app.services.distill_service import distill_persona, ensure_web_search_results
from app.services.web_search import search_web

router = APIRouter(prefix="/personas/{persona_id}", tags=["Distill"])


def _now():
    return datetime.now(timezone.utc)


async def _check_persona(persona_id: str, user_id: str, db: AsyncSession) -> None:
    result = await db.execute(select(Persona).where(Persona.id == persona_id, Persona.user_id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Persona not found")


# ── Manual Input ─────────────────────────────────────────
@router.post("/manual-input", response_model=list[ManualInputOut], status_code=status.HTTP_201_CREATED)
async def add_manual_input(
    persona_id: str,
    data: ManualInputCreate,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await _check_persona(persona_id, user.id, db)
    batch = str(uuid.uuid4())
    now = _now()
    outs = []
    for key, value in data.fields.items():
        mi = PersonaManualInput(
            id=str(uuid.uuid4()),
            persona_id=persona_id,
            field_key=key,
            field_value=value,
            source_batch=batch,
            created_at=now,
        )
        db.add(mi)
        outs.append(ManualInputOut(
            id=mi.id, persona_id=mi.persona_id,
            field_key=mi.field_key, field_value=mi.field_value,
            source_batch=mi.source_batch, created_at=now,
        ))
    await db.flush()
    return outs


@router.get("/manual-input", response_model=list[ManualInputOut])
async def list_manual_inputs(persona_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    await _check_persona(persona_id, user.id, db)
    result = await db.execute(
        select(PersonaManualInput)
        .where(PersonaManualInput.persona_id == persona_id)
        .order_by(PersonaManualInput.created_at)
    )
    inputs = result.scalars().all()
    return [
        ManualInputOut(
            id=mi.id, persona_id=mi.persona_id,
            field_key=mi.field_key, field_value=mi.field_value,
            source_batch=mi.source_batch, created_at=mi.created_at,
        ) for mi in inputs
    ]


# ── Web Search ───────────────────────────────────────────
@router.post("/web-search", response_model=list[WebSearchResultOut])
async def trigger_web_search(
    persona_id: str,
    data: WebSearchRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await _check_persona(persona_id, user.id, db)
    search_results = await search_web(data.queries)
    batch = str(uuid.uuid4())
    now = _now()
    outs = []
    for sr in search_results:
        ws = WebSearchResult(
            id=str(uuid.uuid4()),
            persona_id=persona_id,
            query=sr["query"],
            results_json=json.dumps(sr.get("results", []), ensure_ascii=False),
            search_batch=batch,
            created_at=now,
        )
        db.add(ws)
        outs.append(WebSearchResultOut(
            id=ws.id, persona_id=ws.persona_id,
            query=ws.query, results_json=ws.results_json,
            search_batch=ws.search_batch, created_at=now,
        ))
    await db.flush()
    return outs


@router.get("/web-search", response_model=list[WebSearchResultOut])
async def list_web_searches(persona_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    await _check_persona(persona_id, user.id, db)
    result = await db.execute(
        select(WebSearchResult)
        .where(WebSearchResult.persona_id == persona_id)
        .order_by(WebSearchResult.created_at.desc())
    )
    searches = result.scalars().all()
    return [
        WebSearchResultOut(
            id=ws.id, persona_id=ws.persona_id,
            query=ws.query, results_json=ws.results_json,
            search_batch=ws.search_batch, created_at=ws.created_at,
        ) for ws in searches
    ]


# ── Distill (async background) ────────────────────────────
@router.post("/distill")
async def start_distillation(persona_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Start distillation in background. Returns immediately; frontend polls for soul."""
    await _check_persona(persona_id, user.id, db)

    async def _background_distill(pid: str):
        """Run distillation in a background asyncio task."""
        try:
            async with async_session() as bdb:
                await ensure_web_search_results(pid, bdb)
                await distill_persona(pid, bdb)
                await bdb.commit()
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[DISTILL] Background distillation failed for {pid}: {e}")

    asyncio.create_task(_background_distill(persona_id))
    return {"status": "started", "persona_id": persona_id}


@router.get("/soul")
async def get_current_soul(persona_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    await _check_persona(persona_id, user.id, db)
    result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    soul = result.scalars().first()
    if not soul:
        raise HTTPException(status_code=404, detail="No soul found, run distillation first")
    return {
        "id": soul.id,
        "persona_id": soul.persona_id,
        "version": soul.version,
        "soul_json": json.loads(soul.soul_json),
        "distill_source_count": soul.distill_source_count,
        "created_at": soul.created_at,
    }


@router.get("/soul/history", response_model=list[SoulOut])
async def get_soul_history(persona_id: str, user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    await _check_persona(persona_id, user.id, db)
    result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    souls = result.scalars().all()
    return [SoulOut(
        id=s.id, persona_id=s.persona_id, version=s.version,
        soul_json=s.soul_json, distill_source_count=s.distill_source_count,
        created_at=s.created_at,
    ) for s in souls]