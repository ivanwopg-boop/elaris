"""Chat / Write / Advise API routes (Three Modes) with streaming."""

import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.db_models import Persona, PersonaSoul
from app.models.schemas import ChatRequest, ChatResponse
from app.core.minimax_client import minimax_client
from app.core.prompts import CHAT_SYSTEM_PROMPT, WRITE_SYSTEM_PROMPT, ADVISE_SYSTEM_PROMPT

router = APIRouter(prefix="", tags=["Chat"])


async def _get_soul(persona_id: str, db: AsyncSession) -> dict:
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    soul_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    soul = soul_result.scalars().first()
    if not soul:
        raise HTTPException(status_code=400, detail="Persona has no soul yet. Run distillation first.")
    return {"name": persona.name, "soul_json": soul.soul_json, "soul": json.loads(soul.soul_json)}


async def _sse_event(event_name: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {payload}\n\n"


@router.get("/chat/{persona_id}/stream")
async def chat_stream(persona_id: str, message: str, db: AsyncSession = Depends(get_db)):
    """SSE endpoint: chat with a persona, streaming the response."""
    info = await _get_soul(persona_id, db)
    system_prompt = CHAT_SYSTEM_PROMPT.format(
        name=info["name"],
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
    )
    msgs = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]

    async def event_gen():
        try:
            reply = await minimax_client.chat(msgs, temperature=0.4, max_tokens=2048)
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {})
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/write/{persona_id}/stream")
async def write_stream(persona_id: str, message: str, context: str = "", db: AsyncSession = Depends(get_db)):
    info = await _get_soul(persona_id, db)
    system_prompt = WRITE_SYSTEM_PROMPT.format(
        name=info["name"],
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        context=context or message,
    )

    async def event_gen():
        try:
            reply = await minimax_client.chat(
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": message}],
                temperature=0.4, max_tokens=2048,
            )
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {})
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/advise/{persona_id}/stream")
async def advise_stream(persona_id: str, message: str, context: str = "", db: AsyncSession = Depends(get_db)):
    info = await _get_soul(persona_id, db)
    system_prompt = ADVISE_SYSTEM_PROMPT.format(
        name=info["name"],
        soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        context=context or message,
    )

    async def event_gen():
        try:
            reply = await minimax_client.chat(
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": message}],
                temperature=0.4, max_tokens=2048,
            )
            yield await _sse_event("chat_message", {"content": reply})
            yield await _sse_event("done", {})
        except Exception as e:
            yield await _sse_event("error", {"message": str(e)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ── Keep old blocking endpoints ──

async def _handle_mode(request: ChatRequest, db: AsyncSession) -> ChatResponse:
    info = await _get_soul(request.persona_id, db)
    if request.mode == "chat":
        system_prompt = CHAT_SYSTEM_PROMPT.format(
            name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}]
    elif request.mode == "write":
        system_prompt = WRITE_SYSTEM_PROMPT.format(
            name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
            context=request.context or request.message,
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}]
    elif request.mode == "advise":
        system_prompt = ADVISE_SYSTEM_PROMPT.format(
            name=info["name"], soul_json=json.dumps(info["soul"], indent=2, ensure_ascii=False),
            context=request.context or request.message,
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}]
    else:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {request.mode}")

    reply = await minimax_client.chat(messages, temperature=0.4, max_tokens=2048)
    return ChatResponse(message=reply, sources=["L3"], style_match=0.85)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    request.mode = "chat"
    return await _handle_mode(request, db)

@router.post("/write", response_model=ChatResponse)
async def write(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    request.mode = "write"
    return await _handle_mode(request, db)

@router.post("/advise", response_model=ChatResponse)
async def advise(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    request.mode = "advise"
    return await _handle_mode(request, db)
