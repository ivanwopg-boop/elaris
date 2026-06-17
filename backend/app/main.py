"""Persona Distiller - FastAPI Application Entry Point."""

from contextlib import asynccontextmanager
import json

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from app.config import get_settings
from app.database import init_db, async_session, get_db
from app.api.router import api_router
from app.models.db_models import Persona

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploads directory
uploads_dir = Path(settings.UPLOAD_DIR)
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Include API routes
app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
