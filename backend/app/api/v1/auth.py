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
    max_uses: int = 99,
    tier: str = "premium",
    db: AsyncSession = Depends(get_db),
):
    """Generate an invite code."""
    code = generate_invite_code()
    ic = InviteCode(code=code, tier=tier, max_uses=max_uses)
    db.add(ic)
    await db.flush()
    return {"code": code, "tier": tier, "max_uses": max_uses}



    return response


@router.post("/guest")
async def guest_login(db: AsyncSession = Depends(get_db)):
    """Create a temporary guest account (no invite code needed)."""
    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    name = f"Guest_{uid[:8]}"
    user = User(
        id=uid,
        email=f"guest-{uid}@elaris.app",
        name=name,
        tier="premium",
        provider="guest",
        created_at=now,
    )
    db.add(user)
    await db.flush()
    access_token = create_access_token(uid, "premium")
    return TokenResponse(
        access_token=access_token,
        user=AuthResponse(
            id=user.id, email=user.email, name=user.name,
            tier=user.tier, avatar_url=user.avatar_url,
        )
    )


@router.get("/admin/invite")
async def invite_management_page(
    db: AsyncSession = Depends(get_db),
):
    """Invite code management page. Lists all codes + generate button."""
    from fastapi.responses import HTMLResponse
    from sqlalchemy import select, func
    
    # Get all invite codes
    result = await db.execute(
        select(InviteCode).order_by(InviteCode.created_at.desc())
    )
    codes = result.scalars().all()
    
    # Build code rows HTML
    rows = ""
    for c in codes:
        remaining = c.max_uses - (c.used_count or 0)
        expired = c.expires_at and c.expires_at < datetime.now(timezone.utc)
        status = "expired" if expired else f"{remaining} left"
        rows += f'''
        <tr>
            <td style="font-family:monospace;letter-spacing:0.1em;font-size:13px">{c.code}</td>
            <td><span style="background:#0071e3;color:#fff;font-size:10px;padding:2px 10px;border-radius:10px">{c.tier.upper()}</span></td>
            <td style="font-size:12px;color:#6e6e73">{c.used_count or 0}/{c.max_uses}</td>
            <td style="font-size:12px">{status}</td>
            <td><button onclick="copy('{c.code}')" style="background:none;border:1px solid rgba(0,0,0,0.08);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;color:#0071e3">Copy</button></td>
            <td><a href="/register?code={c.code}" style="color:#0071e3;font-size:11px;text-decoration:none" target="_blank">Register →</a></td>
        </tr>'''
    
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elaris - Manage Invite Codes</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f5f5f7; color:#1d1d1f; }}
.nav {{ background:#fff; border-bottom:1px solid rgba(0,0,0,0.06); padding:14px 24px; display:flex; align-items:center; justify-content:space-between; }}
.nav h1 {{ font-size:16px; font-weight:300; letter-spacing:0.15em; text-transform:uppercase; }}
.nav a {{ font-size:12px; color:#0071e3; text-decoration:none; }}
.container {{ max-width:800px; margin:0 auto; padding:24px; }}
.card {{ background:#fff; border-radius:12px; border:1px solid rgba(0,0,0,0.04); padding:24px; margin-bottom:20px; }}
h2 {{ font-size:18px; font-weight:300; margin-bottom:4px; }}
.sub {{ font-size:12px; color:#6e6e73; margin-bottom:20px; }}
.btn {{ background:#1d1d1f; color:#fff; padding:10px 24px; border-radius:10px; border:none; font-size:13px; cursor:pointer; }}
.btn:hover {{ background:#2a2a2e; }}
.btn:disabled {{ opacity:0.4; cursor:not-allowed; }}
table {{ width:100%; border-collapse:collapse; }}
th {{ font-size:11px; color:#6e6e73; font-weight:400; text-align:left; padding:8px 4px; border-bottom:1px solid rgba(0,0,0,0.06); }}
td {{ padding:10px 4px; border-bottom:1px solid rgba(0,0,0,0.04); }}
tr:hover td {{ background:rgba(0,0,0,0.02); }}
.toast {{ position:fixed; bottom:40px; left:50%; transform:translateX(-50%); background:#1d1d1f; color:#fff; padding:8px 20px; border-radius:8px; font-size:13px; opacity:0; transition:opacity 0.3s; pointer-events:none; }}
.toast.show {{ opacity:1; }}
.empty {{ text-align:center; padding:40px; font-size:13px; color:#6e6e73; }}
@media(max-width:600px) {{ table {{ font-size:12px; }} th,td {{ padding:6px 2px; }} }}
</style>
</head>
<body>
<div class="nav"><h1>Elaris</h1><a href="/">← Back</a></div>
<div class="container">
<div class="card" style="text-align:center">
<h2>Invite Codes</h2>
<p class="sub">Generate a new invite code for premium access</p>
<button class="btn" id="genBtn" onclick="generate()">Generate New Code</button>
<div id="result" style="margin-top:12px;display:none"></div>
</div>
<div class="card" style="padding:16px 24px">
<table>
<thead><tr><th>Code</th><th>Tier</th><th>Used</th><th>Status</th><th></th><th></th></tr></thead>
<tbody id="codes">
{rows}
</tbody>
</table>
{"""<div class="empty">No invite codes yet</div>""" if not codes else ""}
</div>
</div>
<div class="toast" id="toast">Copied</div>
<script>
function copy(t) {{
  navigator.clipboard.writeText(t).then(() => {{
    const el = document.getElementById('toast');
    el.textContent = 'Copied!';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
  }});
}}

async function generate() {{
  const btn = document.getElementById('genBtn');
  const res = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {{
    const r = await fetch('/api/v1/auth/admin/invite-codes', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: JSON.stringify({{}}) }});
    const d = await r.json();
    res.style.display = 'block';
    res.innerHTML = '<div style="font-family:monospace;font-size:18px;letter-spacing:0.15em;padding:10px;background:#f5f5f7;border-radius:8px;margin-bottom:8px">' + d.code + '</div>'
      + '<a href="/register?code=' + d.code + '" style="font-size:13px;color:#0071e3;text-decoration:none">Register link →</a>'
      + '<br><button onclick="copy(\'' + d.code + '\')" style="background:none;border:1px solid rgba(0,0,0,0.08);border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;color:#0071e3;margin-top:6px">Copy code</button>';
    // Add to table dynamically
    const tb = document.getElementById('codes');
    if (tb) {{
      const tr = document.createElement('tr');
      tr.innerHTML = '<td style="font-family:monospace;letter-spacing:0.1em;font-size:13px">' + d.code + '</td>' +
        '<td><span style="background:#0071e3;color:#fff;font-size:10px;padding:2px 10px;border-radius:10px">' + (d.tier||'PREMIUM').toUpperCase() + '</span></td>' +
        '<td style="font-size:12px;color:#6e6e73">0/' + d.max_uses + '</td>' +
        '<td style="font-size:12px">' + d.max_uses + ' left</td>' +
        '<td><button onclick=\"copy(\\\'' + d.code + '\\\')\" style=\"background:none;border:1px solid rgba(0,0,0,0.08);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;color:#0071e3\">Copy</button></td>' +
        '<td><a href=\"/register?code=' + d.code + '\" style=\"color:#0071e3;font-size:11px;text-decoration:none\" target=\"_blank\">Register \u2192</a></td>';
      tb.prepend(tr);
    }}
    res.style.display = 'block';
    res.innerHTML = '<div style="padding:8px">\u2705 Generated! <a href="/register?code=' + d.code + '" style="color:#0071e3">Register link</a></div>';
  }} catch(e) {{
    res.style.display = 'block';
    res.innerHTML = 'Error: ' + e.message;
  }} finally {{
    btn.disabled = false;
    btn.textContent = 'Generate New Code';
  }}
}}
</script>
</body>
</html>"""
    return HTMLResponse(content=html)