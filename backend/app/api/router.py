"""Route aggregation for v1 API."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.personas import router as personas_router
from app.api.v1.files import router as files_router
from app.api.v1.distill import router as distill_router
from app.api.v1.chat import router as chat_router
from app.api.v1.export import router as export_router
from app.api.v1.group_chat import router as group_chat_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(personas_router)
api_router.include_router(files_router)
api_router.include_router(distill_router)
api_router.include_router(chat_router)
api_router.include_router(export_router)
api_router.include_router(group_chat_router)
