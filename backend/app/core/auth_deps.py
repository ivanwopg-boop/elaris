"""Auth dependencies for FastAPI routes."""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.db_models import User
from app.core.auth import decode_token

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get current user from JWT token (cookie or Bearer header)."""
    token = None

    # Try Bearer token first
    if credentials:
        token = credentials.credentials
    # Fallback to cookie
    elif request and "access_token" in request.cookies:
        token = request.cookies["access_token"]

    if not token:
        return None

    payload = decode_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def require_auth(
    user: User | None = Depends(get_current_user),
) -> User:
    """Require authentication. Raises 401 if not logged in."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please log in first",
        )
    return user


def require_tier(required_tier: str):
    """Require a specific tier (premium). Use as Depends(require_tier("premium"))."""
    async def _check(user: User = Depends(require_auth)) -> User:
        tier_order = {"free": 0, "premium": 1, "admin": 2}
        user_level = tier_order.get(user.tier, 0)
        required_level = tier_order.get(required_tier, 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This feature requires {required_tier} tier",
            )
        return user
    return _check


require_premium = require_tier("premium")
require_admin = require_tier("admin")