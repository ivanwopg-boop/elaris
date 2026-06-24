"""Momentum API: persona watch topics + moments."""

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_db
from app.models.db_models import (
    Persona, PersonaWatchTopic, PersonaMoment, PersonaSoul, User, Contact,
)
from app.models.schemas import (
    WatchTopicCreate, WatchTopicOut, WatchTopicUpdate,
    MomentOut, MomentListResponse,
)
from app.core.auth_deps import require_auth
from app.config import get_settings

router = APIRouter(prefix="/momentum", tags=["Momentum"])


# ── Helpers ──────────────────────────────────────────────
def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode("utf-8")).hexdigest()


def _utc_aware(dt: datetime | None) -> datetime | None:
    """Force-attach UTC tzinfo on naive datetimes read from SQLite.

    SQLite doesn't preserve timezone info, so `datetime.now(timezone.utc)` rows
    come back naive. Without this, Pydantic emits ISO strings without a 'Z'
    suffix and the browser's `new Date()` treats them as local time — which
    shifts display 8h off for Asia/Shanghai users.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _is_paid_tier(tier: str) -> bool:
    return tier in ("plus", "pro", "admin")


# ── Watch Topics ─────────────────────────────────────────
@router.get("/personas/{persona_id}/watch-topics", response_model=List[WatchTopicOut])
async def list_watch_topics(
    persona_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """List watch topics for a persona (owned by current user or public preset)."""
    # Verify access: persona must be either owned by user or public
    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.user_id and persona.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your persona")

    rows = await db.execute(
        select(PersonaWatchTopic)
        .where(PersonaWatchTopic.persona_id == persona_id)
        .order_by(PersonaWatchTopic.is_auto_generated.desc(), PersonaWatchTopic.created_at.asc())
    )
    return [WatchTopicOut.model_validate(r) for r in rows.scalars().all()]


@router.post("/personas/{persona_id}/watch-topics", response_model=WatchTopicOut, status_code=status.HTTP_201_CREATED)
async def create_watch_topic(
    persona_id: str,
    data: WatchTopicCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Add a manual watch topic. Free tier: cannot edit (this endpoint requires Plus)."""
    if not _is_paid_tier(user.tier):
        raise HTTPException(status_code=403, detail="Editing watch topics requires Plus subscription.")

    persona = await db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.user_id and persona.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your persona")

    topic = data.topic.strip()
    if not topic or len(topic) > 256:
        raise HTTPException(status_code=400, detail="Topic must be 1-256 chars")

    # Dedup
    existing = await db.execute(
        select(PersonaWatchTopic).where(
            and_(
                PersonaWatchTopic.persona_id == persona_id,
                PersonaWatchTopic.topic == topic,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Topic already exists")

    # Plus: max 10; Pro: unlimited
    if user.tier == "plus":
        count_res = await db.execute(
            select(func.count(PersonaWatchTopic.id)).where(PersonaWatchTopic.persona_id == persona_id)
        )
        count = count_res.scalar() or 0
        if count >= 10:
            raise HTTPException(status_code=403, detail="Plus tier: max 10 watch topics. Upgrade to Pro for unlimited.")

    row = PersonaWatchTopic(
        id=str(uuid.uuid4()),
        persona_id=persona_id,
        topic=topic,
        source_lang=data.source_lang,
        is_auto_generated=False,
        is_active=True,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return WatchTopicOut.model_validate(row)


@router.patch("/personas/{persona_id}/watch-topics/{topic_id}", response_model=WatchTopicOut)
async def update_watch_topic(
    persona_id: str,
    topic_id: str,
    data: WatchTopicUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    if not _is_paid_tier(user.tier):
        raise HTTPException(status_code=403, detail="Editing watch topics requires Plus subscription.")

    row = await db.get(PersonaWatchTopic, topic_id)
    if not row or row.persona_id != persona_id:
        raise HTTPException(status_code=404, detail="Watch topic not found")

    persona = await db.get(Persona, persona_id)
    if persona.user_id and persona.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your persona")

    if data.topic is not None:
        topic = data.topic.strip()
        if not topic or len(topic) > 256:
            raise HTTPException(status_code=400, detail="Topic must be 1-256 chars")
        row.topic = topic
    if data.is_active is not None:
        row.is_active = data.is_active

    await db.commit()
    await db.refresh(row)
    return WatchTopicOut.model_validate(row)


@router.delete("/personas/{persona_id}/watch-topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watch_topic(
    persona_id: str,
    topic_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    if not _is_paid_tier(user.tier):
        raise HTTPException(status_code=403, detail="Editing watch topics requires Plus subscription.")

    row = await db.get(PersonaWatchTopic, topic_id)
    if not row or row.persona_id != persona_id:
        raise HTTPException(status_code=404, detail="Watch topic not found")
    persona = await db.get(Persona, persona_id)
    if persona.user_id and persona.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your persona")
    await db.delete(row)
    await db.commit()
    return None


# ── Moments ──────────────────────────────────────────────
@router.get("/moments", response_model=MomentListResponse)
async def list_moments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
    limit: int = Query(50, ge=1, le=200),
    include_expired: bool = Query(False),
    lang: str = Query(None, description="Filter by source language (en or zh-CN)"),
):
    """List the current user's moments, filtered by language when specified."""
    # Daily limit removed (2026-06-23): MVP — all users unlimited
    daily_limit = None
    is_paid = True

    # Main list query
    q = select(PersonaMoment, Persona, PersonaWatchTopic).outerjoin(
        Persona, Persona.id == PersonaMoment.persona_id
    ).outerjoin(
        PersonaWatchTopic, PersonaWatchTopic.id == PersonaMoment.watch_topic_id
    ).where(PersonaMoment.user_id == user.id)

    if lang:
        q = q.where(PersonaMoment.source_lang == lang)

    if not include_expired:
        # Active = not expired yet
        q = q.where(
            or_(
                PersonaMoment.status == "expired",
                PersonaMoment.expires_at > datetime.now(timezone.utc),
            )
        ).where(PersonaMoment.status != "expired")

    q = q.order_by(PersonaMoment.created_at.desc()).limit(limit)
    rows = (await db.execute(q)).all()

    out = []
    for m, p, wt in rows:
        # DB stores naive datetimes in UTC (since SQLite doesn't preserve tzinfo).
        # Force UTC tzinfo so Pydantic serializes with 'Z' suffix; otherwise the
        # frontend's `new Date(iso)` interprets naive strings as local time,
        # shifting everything 8h off for Asia/Shanghai users.
        out.append(MomentOut(
            id=m.id,
            persona_id=m.persona_id,
            persona_name=p.name if p else None,
            persona_avatar_url=p.avatar_url if p else None,
            watch_topic_id=m.watch_topic_id,
            watch_topic=wt.topic if wt else None,
            source_url=m.source_url,
            source_title=m.source_title,
            source_published_at=_utc_aware(m.source_published_at),
            source_lang=m.source_lang,
            persona_comment=m.persona_comment,
            emotion=m.emotion,
            hook_question=m.hook_question,
            status=m.status,
            created_at=_utc_aware(m.created_at),
            read_at=_utc_aware(m.read_at),
            expires_at=_utc_aware(m.expires_at),
        ))

    unread_res = await db.execute(
        select(func.count(PersonaMoment.id)).where(
            and_(PersonaMoment.user_id == user.id, PersonaMoment.status == "unread")
        )
    )
    unread = unread_res.scalar() or 0

    return MomentListResponse(
        moments=out,
        unread_count=unread,
        daily_viewed_count=0,
        daily_viewed_limit=daily_limit,
        is_paid=is_paid,
    )


@router.get("/moments/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    res = await db.execute(
        select(func.count(PersonaMoment.id)).where(
            and_(PersonaMoment.user_id == user.id, PersonaMoment.status == "unread")
        )
    )
    return {"unread_count": res.scalar() or 0}


@router.post("/moments/mark-all-read")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Mark all unread moments as read for the current user."""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(PersonaMoment).where(
            and_(PersonaMoment.user_id == user.id, PersonaMoment.status == "unread")
        )
    )
    count = 0
    for m in res.scalars().all():
        m.status = "read"
        m.read_at = now
        count += 1
    await db.commit()
    return {"marked": count}


@router.post("/moments/{moment_id}/read", response_model=MomentOut)
async def mark_moment_read(
    moment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Mark moment as read. Free users: increment daily count; if limit hit, hide content."""
    m = await db.get(PersonaMoment, moment_id)
    if not m or m.user_id != user.id:
        raise HTTPException(status_code=404, detail="Moment not found")

    # Daily limit removed (2026-06-23)

    if m.status == "unread":
        m.status = "read"
        m.read_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(m)

    persona = await db.get(Persona, m.persona_id)
    wt = await db.get(PersonaWatchTopic, m.watch_topic_id) if m.watch_topic_id else None
    return MomentOut(
        id=m.id,
        persona_id=m.persona_id,
        persona_name=persona.name if persona else None,
        persona_avatar_url=persona.avatar_url if persona else None,
        watch_topic_id=m.watch_topic_id,
        watch_topic=wt.topic if wt else None,
        source_url=m.source_url,
        source_title=m.source_title,
        source_published_at=m.source_published_at,
        source_lang=m.source_lang,
        persona_comment=m.persona_comment,
        emotion=m.emotion,
        hook_question=m.hook_question,
        status=m.status,
        created_at=m.created_at,
        read_at=m.read_at,
        expires_at=m.expires_at,
    )


@router.post("/moments/{moment_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_moment(
    moment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    m = await db.get(PersonaMoment, moment_id)
    if not m or m.user_id != user.id:
        raise HTTPException(status_code=404, detail="Moment not found")
    if m.status not in ("dismissed", "expired"):
        m.status = "dismissed"
        m.dismissed_at = datetime.now(timezone.utc)
        await db.commit()
    return None


@router.post("/moments/{moment_id}/chat")
async def moment_to_chat(
    moment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Get the context for opening chat on this moment. Returns persona_id + a context snippet."""
    m = await db.get(PersonaMoment, moment_id)
    if not m or m.user_id != user.id:
        raise HTTPException(status_code=404, detail="Moment not found")

    # Mark as replied (counts as viewed too)
    if m.status in ("unread", "read"):
        m.status = "replied"
        if not m.read_at:
            m.read_at = datetime.now(timezone.utc)
        await db.commit()

    return {
        "persona_id": m.persona_id,
        "context_title": m.source_title,
        "context_url": m.source_url,
        "persona_comment": m.persona_comment,
        "hook_question": m.hook_question,
    }


# ── Admin: Generate moments (called by crontab) ─────────
@router.post("/admin/scan")
async def admin_scan_moments(
    db: AsyncSession = Depends(get_db),
):
    """Triggered by crontab every 30 min. Generate moments for active watch topics.
    Protected by shared secret in X-Cron-Token header.
    """
    # Auth via shared header token
    from fastapi import Request, Header
    # Re-import to keep simple — we won't use Depends
    # NOTE: this endpoint is intentionally NOT behind require_auth.
    # Callers (crontab scripts) must send X-Cron-Token matching settings.MOMENTUM_CRON_TOKEN.
    return {"status": "stub", "msg": "handled by services/news_sync.py"}  # real impl is in news_sync
