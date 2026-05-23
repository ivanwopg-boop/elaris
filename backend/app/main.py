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
from app.services.seed_service import seed_presets
from app.models.db_models import Persona

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    # Seed preset personas
    async with async_session() as session:
        count = await seed_presets(session)
        if count:
            print(f"Seeded {count} preset personas")
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


# ── Simple HTML app (no Next.js dependency) ──────────────
import uuid as _uuid
from app.core.auth import create_access_token as _create_token
from app.models.db_models import User as _User, PersonaSoul as _PersonaSoul


@app.get("/app")
async def simple_app(request: Request, db: AsyncSession = Depends(get_db)):
    """Simple HTML app that lists personas and allows operations."""
    from fastapi.responses import HTMLResponse
    from sqlalchemy import select

    # Auto-create guest user
    token = request.cookies.get("access_token")
    user = None
    if token:
        from app.core.auth import decode_token
        payload = decode_token(token)
        if payload:
            result = await db.execute(select(_User).where(_User.id == payload.get("sub")))
            user = result.scalar_one_or_none()

    if not user:
        uid = str(_uuid.uuid4())
        user = _User(id=uid, email=f"g-{uid[:8]}@e.app", name=f"Guest_{uid[:8]}", tier="premium", provider="guest")
        db.add(user)
        await db.flush()
        await db.commit()
        new_token = _create_token(uid, "premium")
        from fastapi.responses import RedirectResponse
        resp = RedirectResponse(url="/app")
        resp.set_cookie(key="access_token", value=new_token, max_age=60*60*24*7, httponly=True, path="/")
        return resp

    # Get personas
    result = await db.execute(
        select(Persona).where((Persona.user_id == user.id) | (Persona.user_id.is_(None))).order_by(Persona.created_at.desc())
    )
    personas = result.scalars().all()

    html = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Elaris</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f7;color:#1d1d1f}
.nav{background:#fff;border-bottom:1px solid rgba(0,0,0,.06);padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
.nav h1{font-size:16px;font-weight:300;letter-spacing:.15em;text-transform:uppercase}
.nav span{font-size:12px;color:#86868b}
.container{max-width:720px;margin:0 auto;padding:24px}
.card{background:#fff;border-radius:12px;padding:16px 20px;margin-bottom:10px;border:1px solid rgba(0,0,0,.04);cursor:pointer;transition:.2s}
.card:hover{box-shadow:0 2px 8px rgba(0,0,0,.06)}
.card h3{font-size:14px;font-weight:400;margin-bottom:4px}
.card p{font-size:12px;color:#86868b}
.badge{display:inline-block;font-size:10px;padding:2px 8px;border-radius:10px;background:#e8e8ed;color:#86868b;margin-left:8px}
.badge.ready{background:#0071e3;color:#fff}
.btn{display:inline-block;padding:10px 20px;border-radius:10px;border:none;font-size:13px;cursor:pointer;background:#1d1d1f;color:#fff;text-decoration:none}
.btn:hover{background:#2a2a2e}
pre{background:#f5f5f7;padding:14px;border-radius:8px;font-size:11px;overflow:auto;max-height:300px;white-space:pre-wrap;margin-top:12px}
.page-title{font-size:18px;font-weight:300;margin-bottom:16px}
.back{font-size:12px;color:#0071e3;text-decoration:none;display:inline-block;margin-bottom:16px}
.status{font-size:12px;color:#86868b;margin:8px 0}
</style></head><body>
<div class="nav"><h1>Elaris</h1><span>""" + user.name + """</span></div>
<div class="container">"""

    # Check if viewing a specific persona
    import re
    path = request.url.path

    pid_match = re.search(r'/persona/([a-f0-9-]+)', str(request.url))
    if pid_match:
        pid = pid_match.group(1)
        result = await db.execute(select(Persona).where(Persona.id == pid))
        persona = result.scalar_one_or_none()
        if not persona:
            html += "<p>Persona not found</p></div></body></html>"""
            return HTMLResponse(content=html)

        soul_result = await db.execute(select(_PersonaSoul).where(_PersonaSoul.persona_id == pid).order_by(_PersonaSoul.version.desc()))
        soul = soul_result.scalars().first()

        html += f'<a href="/app" class="back">← Back to personas</a>'
        html += f'<h2 class="page-title">{persona.name}</h2>'
        if soul:
            html += f'<span class="badge ready">Soul v{soul.version}</span>'
            try:
                sj = json.loads(soul.soul_json)
                html += f'<pre>{json.dumps(sj, indent=2, ensure_ascii=False)}</pre>'
            except:
                html += f'<pre>{soul.soul_json[:500]}...</pre>'
        else:
            html += '<p class="status">Not yet distilled</p>'
            html += f'<button class="btn" onclick="fetch(\"/distill/{pid}\").then(r=>r.text()).then(t=>location.reload())">Start Distillation</button>'

        html += "</div></body></html>"
        return HTMLResponse(content=html)

    # List personas
    html += '<h2 class="page-title">Personas</h2>'
    for p in personas:
        has_soul = False
        sr = await db.execute(select(_PersonaSoul).where(_PersonaSoul.persona_id == p.id))
        if sr.scalars().first():
            has_soul = True
        badge = '<span class="badge ready">Soul</span>' if has_soul else '<span class="badge">No Soul</span>'
        html += f'<a href="/app/persona/{p.id}" style="text-decoration:none;color:inherit"><div class="card"><h3>{p.name} {badge}</h3><p>{p.description or ""}</p></div></a>'

    html += """</div></body></html>"""
    return HTMLResponse(content=html)


@app.get("/distill/{persona_id}")
async def simple_distill(persona_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Trigger distillation and redirect back."""
    from app.services.distill_service import distill_persona, ensure_web_search_results
    try:
        await ensure_web_search_results(persona_id, db)
        await distill_persona(persona_id, db)
        await db.commit()
    except Exception as e:
        print(f"Distill failed: {e}")
        import traceback
        traceback.print_exc()
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"/app/persona/{persona_id}")
