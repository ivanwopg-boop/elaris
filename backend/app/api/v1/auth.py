"""Auth API routes — login, register, logout, refresh, me."""

import uuid
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.db_models import User, Session, InviteCode
from app.core.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, generate_invite_code,
)
from app.core.auth_deps import require_auth


router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Schemas ─────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str | None = None
    name: str | None = None
    invite_code: str | None = None


class LoginRequest(BaseModel):
    invite_code: str


class AuthResponse(BaseModel):
    id: str
    email: str
    name: str | None
    tier: str
    avatar_url: str | None
    persona_count: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthResponse


# ── Helpers ─────────────────────────────────────────────
def _set_cookie(response: Response, token: str, max_age: int):
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=max_age,
        httponly=True,
        secure=False,  # set True in production behind HTTPS
        samesite="lax",
        path="/",
    )


# ── Routes ─────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email not already registered
    existing = await db.execute(select(User).where(User.email == data.email.lower().strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Determine tier from invite code
    tier = "free"
    if data.invite_code:
        code_result = await db.execute(
            select(InviteCode).where(InviteCode.code == data.invite_code.upper())
        )
        code = code_result.scalar_one_or_none()
        if not code:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        if code.used_count >= code.max_uses:
            raise HTTPException(status_code=400, detail="Invite code exhausted")
        if code.expires_at and code.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invite code expired")
        tier = code.tier
        code.used_count += 1

    # Create user
    user_id = str(uuid.uuid4())
    password_hash = hash_password(data.password) if data.password else None
    user = User(
        id=user_id,
        email=data.email.lower().strip(),
        password_hash=password_hash,
        name=data.name or data.email.split("@")[0],
        tier=tier,
        provider="email",
    )
    db.add(user)
    await db.flush()

    # Count personas for this user (initially 0 for new users)
    pc_result = await db.execute(
        select(func.count()).select_from(User).where(User.id == user_id)
    )

    access_token = create_access_token(user_id, tier)
    response = Response(content=TokenResponse(
        access_token=access_token,
        user=AuthResponse(
            id=user.id, email=user.email, name=user.name,
            tier=user.tier, avatar_url=user.avatar_url,
            persona_count=0,
        )
    ).model_dump_json(), media_type="application/json")
    _set_cookie(response, access_token, 60 * 60 * 24 * 7)
    return response


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Validate invite code
    code_result = await db.execute(
        select(InviteCode).where(InviteCode.code == data.invite_code.upper())
    )
    code = code_result.scalar_one_or_none()
    if not code:
        raise HTTPException(status_code=401, detail="Invalid invite code")
    if code.used_count >= code.max_uses:
        raise HTTPException(status_code=401, detail="Invite code exhausted")
    if code.expires_at and code.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invite code expired")

    tier = code.tier
    code.used_count += 1

    # Auto-register or login user by invite code
    email = f"invite-{code.code.lower()}@elaris.app"
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()

    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            name=f"User_{code.code[:6]}",
            tier=tier,
            provider="invite_code",
        )
        db.add(user)
        await db.flush()
    else:
        if tier == "premium" and user.tier != "premium":
            user.tier = tier
            await db.flush()

    access_token = create_access_token(user.id, user.tier)
    response = Response(content=TokenResponse(
        access_token=access_token,
        user=AuthResponse(
            id=user.id, email=user.email, name=user.name,
            tier=user.tier, avatar_url=user.avatar_url,
            persona_count=0,
        )
    ).model_dump_json(), media_type="application/json")
    _set_cookie(response, access_token, 60 * 60 * 24 * 30)  # 30 days
    return response


@router.post("/logout")
async def logout(response: Response):
    response = Response(content="{\"ok\":true}", media_type="application/json")
    response.set_cookie(key="access_token", value="", max_age=0, httponly=True, path="/")
    return response


@router.get("/me", response_model=AuthResponse)
async def get_me(user: User = Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Get current user info. Requires access_token cookie or Bearer token."""
    return AuthResponse(
        id=user.id, email=user.email, name=user.name,
        tier=user.tier, avatar_url=user.avatar_url,
    )


# ── OAuth placeholders (requires API keys setup) ───────
@router.get("/google")
async def auth_google():
    raise HTTPException(status_code=501, detail="Google OAuth requires Google OAuth App Credentials configured")


@router.get("/google/callback")
async def auth_google_callback():
    raise HTTPException(status_code=501, detail="Google OAuth requires Google OAuth App Credentials configured")


@router.get("/twitter")
async def auth_twitter():
    raise HTTPException(status_code=501, detail="X OAuth requires X Developer App Credentials configured")


@router.get("/twitter/callback")
async def auth_twitter_callback():
    raise HTTPException(status_code=501, detail="X OAuth requires X Developer App Credentials configured")


# ── Admin: generate invite codes ───────────────────────
@router.post("/admin/invite-codes")
async def generate_code(
    request: Request,
    max_uses: int = 99,
    tier: str = "premium",
    db: AsyncSession = Depends(get_db),
):
    """Generate an invite code (requires admin access via shared secret for now)."""
    # Simple admin check via header (replace with proper auth in production)
    admin_key = request.headers.get("X-Admin-Key", "")
    from app.config import get_settings
    settings = get_settings()
    if admin_key != (getattr(settings, "ADMIN_SECRET", "changeme")):
        raise HTTPException(status_code=403, detail="Forbidden")

    code = generate_invite_code()
    ic = InviteCode(code=code, tier=tier, max_uses=max_uses)
    db.add(ic)
    await db.flush()
    return {"code": code, "tier": tier, "max_uses": max_uses}