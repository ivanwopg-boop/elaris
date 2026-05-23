"""Brainstorm API routes — sequential topic discussion."""

import json
import uuid
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.db_models import BrainstormSession, BrainstormMessage, BrainstormFile, User
from app.core.auth_deps import require_auth, require_premium
from app.services.file_parser import parse_file, allowed_file
from app.models.schemas import (
    BrainstormCreate, BrainstormSessionOut, BrainstormMessageOut,
    BrainstormDetail, BrainstormTopicItem, ExportBrainstormRequest,
    BrainstormAddTopic, BrainstormStartRequest,
)
import asyncio
from app.services.brainstorm_service import create_session, run_brainstorm, run_brainstorm_stream
from app.services.brainstorm_export import export_brainstorm

router = APIRouter(prefix="/brainstorm", tags=["Brainstorm"])


@router.post("", response_model=BrainstormSessionOut, status_code=status.HTTP_201_CREATED)
async def create_brainstorm(
    data: BrainstormCreate,
    user: User = Depends(require_premium),
    db: AsyncSession = Depends(get_db),
):
    """Create a brainstorm session with a topic (discussion starts immediately via SSE)."""
    session = await create_session(
        title=data.title,
        topics=[{"title": data.topic, "detail": data.topic_detail}],
        persona_ids=data.persona_ids,
        persona_roles=data.persona_roles,
        max_rounds=data.max_rounds,
        db=db,
        user_id=user.id,
    )
    return _session_to_out(session, 0)


@router.post("/{session_id}/add-topic", response_model=BrainstormSessionOut)
async def add_topic_to_session(
    session_id: str,
    data: BrainstormAddTopic,
    user: User = Depends(require_premium),
    db: AsyncSession = Depends(get_db),
):
    """Add a new topic to an existing session."""
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    topics = json.loads(session.topics)
    topics.append({"title": data.title, "detail": data.detail})
    session.topics = json.dumps(topics, ensure_ascii=False)
    await db.flush()

    return _session_to_out(session, await _count_messages(session_id, db))


@router.post("/{session_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_brainstorm_files(
    session_id: str,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload files to a brainstorm session (used as discussion context)."""
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    import tempfile, os
    uploaded = []
    for file in files:
        if not file.filename or not allowed_file(file.filename):
            continue
        contents = await file.read()
        # Save to temp and parse
        suffix = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        try:
            parsed = await parse_file(tmp_path, suffix)
        finally:
            os.unlink(tmp_path)
        bf = BrainstormFile(
            id=str(uuid.uuid4()),
            session_id=session_id,
            file_name=file.filename,
            parsed_content=parsed,
        )
        db.add(bf)
        uploaded.append({"id": bf.id, "file_name": bf.file_name})
    await db.flush()
    return {"files": uploaded}


async def _sse_event(event_name: str, data: dict) -> str:
    """Format a dict as an SSE event."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {payload}\n\n"


async def brainstorm_sse_generator(session_id: str, db: AsyncSession, topic: str | None):
    """
    Async generator that yields SSE-formatted strings from run_brainstorm_stream.
    Also handles adding the topic to the session before starting.
    """
    # Load session
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        async for chunk in _error_sse("Session not found"):
            yield chunk
        return

    topics = json.loads(session.topics)
    if not topics and topic:
        topics.append({"title": topic, "detail": ""})
        session.topics = json.dumps(topics, ensure_ascii=False)
        await db.flush()
    elif not topics:
        async for chunk in _error_sse("No topic to discuss. Provide a topic."):
            yield chunk
        return

    async for event in run_brainstorm_stream(session_id, db):
        ev_type = event.pop("type", None)
        if ev_type == "topic_set":
            yield await _sse_event("topic_set", event)
        elif ev_type == "turn_start":
            yield await _sse_event("turn_start", event)
        elif ev_type == "thinking":
            yield await _sse_event("thinking", event)
        elif ev_type == "message":
            yield await _sse_event("message", event)
        elif ev_type == "summary":
            yield await _sse_event("summary", event)
        elif ev_type == "done":
            yield await _sse_event("done", event)
        elif ev_type == "error":
            yield await _sse_event("error", event)


# ── In-memory set to track running discussions ──
_running_discussions: set[str] = set()


# Per-session lock to prevent concurrent runs
_session_locks: set[str] = set()

@router.post("/{session_id}/start-blocking")
async def start_brainstorm_blocking(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Start discussion synchronously."""
    from app.models.db_models import BrainstormSession as _BS
    from sqlalchemy import select
    # Check session status - if already completed, return immediately
    sr = await db.execute(select(_BS).where(_BS.id == session_id))
    sess = sr.scalar_one_or_none()
    if sess and sess.status == "completed":
        return {"status": "completed"}
    if session_id in _session_locks:
        return {"status": "busy"}
    _session_locks.add(session_id)
    try:
        async for _ in run_brainstorm_stream(session_id, db):
            pass
        return {"status": "completed"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
    finally:
        _session_locks.discard(session_id)


async def _error_sse(message: str):
    yield await _sse_event("error", {"message": message})


@router.get("/{session_id}/sse")
async def brainstorm_sse(
    session_id: str,
    topic: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    SSE endpoint for real-time brainstorm streaming.
    Connects to the stream and receives events as they happen.

    Query params:
      - topic: optional topic string; added to session if no topics exist yet

    SSE events:
      - topic_set    { title, detail }
      - round_start  { round }
      - thinking     { persona_name, round }
      - message      { persona_name, content, round }
      - round_end    { round }
      - summary      { text }
      - done         {}
      - error        { message }
    """
    return StreamingResponse(
        brainstorm_sse_generator(session_id, db, topic),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/start")
async def start_brainstorm(
    session_id: str,
    data: BrainstormStartRequest = BrainstormStartRequest(),
    db: AsyncSession = Depends(get_db),
):
    """
    Start/continue discussion on a topic.
    If session has no topics yet, use the topic from request body.
    Runs the discussion blocking (may take a while).
    """
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # If no topics, add from request
    topics = json.loads(session.topics)
    if not topics and data.topic:
        topics.append({"title": data.topic, "detail": ""})
        session.topics = json.dumps(topics, ensure_ascii=False)
        await db.flush()

    if not topics:
        raise HTTPException(status_code=400, detail="No topic to discuss. Provide a topic.")

    try:
        result = await run_brainstorm(session_id, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=list[BrainstormSessionOut])
async def list_brainstorms(user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    """List all brainstorm sessions."""
    result = await db.execute(
        select(BrainstormSession)
        .where(BrainstormSession.user_id == user.id)
        .order_by(BrainstormSession.created_at.desc())
    )
    sessions = result.scalars().all()
    outs = []
    for s in sessions:
        msg_count = await _count_messages(s.id, db)
        outs.append(_session_to_out(s, msg_count))
    return outs


@router.get("/{session_id}", response_model=BrainstormDetail)
async def get_brainstorm(session_id: str, user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    """Get brainstorm session detail with all messages."""
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msg_count = await _count_messages(session_id, db)
    msg_result = await db.execute(
        select(BrainstormMessage)
        .where(BrainstormMessage.session_id == session_id)
        .order_by(BrainstormMessage.round_number, BrainstormMessage.created_at)
    )
    messages = msg_result.scalars().all()

    return BrainstormDetail(
        session=_session_to_out(session, msg_count),
        messages=[BrainstormMessageOut(
            id=m.id, session_id=m.session_id,
            round_number=m.round_number,
            persona_id=m.persona_id,
            persona_name=m.persona_name,
            content=m.content,
            created_at=m.created_at,
        ) for m in messages],
    )


@router.post("/{session_id}/export")
async def export_brainstorm_session(
    session_id: str,
    data: ExportBrainstormRequest = ExportBrainstormRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Export brainstorm as DOCX or PDF."""
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msg_result = await db.execute(
        select(BrainstormMessage)
        .where(BrainstormMessage.session_id == session_id)
        .order_by(BrainstormMessage.round_number, BrainstormMessage.created_at)
    )
    messages = msg_result.scalars().all()

    try:
        content = await export_brainstorm(session, messages, "docx")
        import io
        from fastapi.responses import Response
        from urllib.parse import quote

        safe_name = quote(session.title, safe='') or "brainstorm"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"{safe_name}_brainstorm.docx"

        return Response(
            content=content.getvalue(),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brainstorm(session_id: str, user: User = Depends(require_premium), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BrainstormSession).where(BrainstormSession.id == session_id, BrainstormSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.flush()


# ── Helpers ──

async def _count_messages(session_id: str, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(BrainstormMessage)
        .where(BrainstormMessage.session_id == session_id)
    )
    return result.scalar() or 0


def _session_to_out(session: BrainstormSession, msg_count: int = 0) -> BrainstormSessionOut:
    return BrainstormSessionOut(
        id=session.id,
        title=session.title,
        topics=[BrainstormTopicItem(**t) for t in json.loads(session.topics)],
        persona_ids=json.loads(session.persona_ids),
        persona_roles=json.loads(session.persona_roles) if session.persona_roles else {},
        max_rounds=session.max_rounds,
        status=session.status,
        completed_rounds=session.completed_rounds,
        summary=session.summary,
        message_count=msg_count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
