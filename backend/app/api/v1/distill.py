"""Distillation & web search API routes."""

import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth_deps import require_auth
from app.database import get_db_with_retry as get_db
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
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    # Preset personas (user_id=NULL) are public — allow any authenticated user
    if persona.user_id is None:
        return
    if persona.user_id != user_id:
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


# ── Distill ──────────────────────────────────────────────
@router.post("/distill", response_model=DistillResponse)
async def run_distillation(
    persona_id: str,
    lang: str = Query("en", description="Language: en | zh-CN"),
    use_v2: bool = Query(True, description="Use v2 cognitive profile schema"),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Run distillation for both en and zh-CN synchronously."""
    await _check_persona(persona_id, user.id, db)
    try:
        await ensure_web_search_results(persona_id, db)
        souls = {}
        version = 0
        sources_used = 0
        # Distill BOTH en and zh-CN so users always get a bilingual soul.
        # Each lang is wrapped in try/except: one failure must not block the other.
        lang_configs = [("en", True), ("zh-CN", True)]
        for target_lang, target_v2 in lang_configs:
            try:
                result = await distill_persona(persona_id, db, lang=target_lang, use_v2=target_v2)
                souls[target_lang] = result["soul"].model_dump()
                version = max(version, result["version"])
                sources_used = result["sources_used"]
            except Exception as lang_err:
                # Log but continue with the next language so we never return a half-distilled persona.
                import traceback
                print(f"[distill] lang={target_lang} failed: {lang_err}", flush=True)
                traceback.print_exc()
                continue
        # Auto-categorize based on v2 soul expertise data
        en_soul = souls.get("en", {})
        if en_soul:
            try:
                from app.services.distill_service import infer_category
                identity = en_soul.get("identity", {})
                expertise = en_soul.get("expertise", {})
                domains = (expertise.get("deep_domains") or []) + (expertise.get("competent_domains") or [])
                cat = infer_category(
                    identity.get("title", ""),
                    identity.get("organization", ""),
                    domains,
                )
                # Update persona record
                from sqlalchemy import update
                from app.models.db_models import Persona
                await db.execute(
                    update(Persona).where(Persona.id == persona_id).values(
                        category=cat, is_public=True
                    )
                )
                await db.commit()
            except Exception:
                pass  # Non-critical, don't fail distillation

        # After distillation, update persona.source_name to the original
        # real-person name so we preserve it for transparency.
        # The display name (persona.name) will be set by the user.
        try:
            from sqlalchemy import select as _selx
            from app.models.db_models import Persona
            pr = await db.execute(_selx(Persona).where(Persona.id == persona_id))
            persona = pr.scalar_one_or_none()
            if persona and not persona.source_name:
                await db.execute(
                    update(Persona).where(Persona.id == persona_id).values(
                        source_name=persona.name,
                    )
                )
                await db.commit()
                source_name = persona.name
        except Exception:
            pass

        # Collect display_name and source_name for response
        display_name = ""
        name_options: list[str] = []
        try:
            from sqlalchemy import select as _selx2
            from app.models.db_models import Persona
            pr2 = await db.execute(_selx2(Persona).where(Persona.id == persona_id))
            p2 = pr2.scalar_one_or_none()
            if p2:
                display_name = p2.name
                source_name = p2.source_name or ""
        except Exception:
            pass

        return DistillResponse(
            persona_id=persona_id,
            display_name=display_name or source_name,
            name_options=name_options,
            source_name=source_name,
            soul=souls.get("en", {}),
            souls=souls,
            version=version,
            sources_used=sources_used,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Distillation failed: {str(e)}")


@router.get("/distill-test")
async def distill_test_page(persona_id: str, db: AsyncSession = Depends(get_db)):
    """Simple HTML page to trigger distillation without frontend."""
    from fastapi.responses import HTMLResponse
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        return HTMLResponse("<h2>Persona not found</h2>", status_code=404)

    # Check if persona has soul
    soul_result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id)
        .order_by(PersonaSoul.version.desc())
    )
    existing_soul = soul_result.scalars().first()

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elaris - Distill {persona.name}</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f5f5f7; display:flex; justify-content:center; align-items:center; min-height:100vh; }}
.card {{ background:#fff; border-radius:16px; padding:40px; max-width:640px; width:90%; box-shadow:0 1px 3px rgba(0,0,0,0.08); }}
h2 {{ font-weight:300; font-size:22px; color:#1d1d1f; margin-bottom:8px; }}
.status {{ font-size:13px; color:#6e6e73; margin-bottom:24px; }}
.btn {{ background:#1d1d1f; color:#fff; padding:12px 28px; border-radius:10px; border:none; font-size:14px; cursor:pointer; }}
.btn:disabled {{ opacity:0.4; cursor:not-allowed; }}
.btn:hover:not(:disabled) {{ background:#2a2a2e; }}
pre {{ background:#f5f5f7; padding:16px; border-radius:10px; font-size:11px; overflow-x:auto; margin-top:20px; max-height:400px; overflow-y:auto; white-space:pre-wrap; }}
.error {{ color:#d32f2f; font-size:13px; margin:12px 0; }}  
</style>
</head>
<body>
<div class="card">
<h2>{persona.name}</h2>
<p class="status" id="status">{"Soul exists!" if existing_soul else "Not yet distilled"}</p>
{"" if existing_soul else '<button class="btn" id="distillBtn" onclick="startDistill()">Start Distillation</button>'}
<pre id="output"></pre>
</div>
<script>
function getToken() {{
  try {{
    const s = localStorage.getItem("auth-storage");
    if (!s) return null;
    return JSON.parse(s)?.state?.token || null;
  }} catch {{ return null; }}
}}
async function startDistill() {{
  const btn = document.getElementById("distillBtn");
  const status = document.getElementById("status");
  const output = document.getElementById("output");
  const token = getToken();
  if (!token) {{
    status.textContent = "Please login first";
    output.textContent = "Go to /login then come back";
    return;
  }}
  btn.disabled = true;
  btn.textContent = "Distilling...";
  status.textContent = "Running distillation...";
  try {{
    const res = await fetch("/api/v1/personas/{persona_id}/distill", {{
      method: "POST",
      headers: {{ "Authorization": "Bearer " + token, "Content-Type": "application/json" }}
    }});
    if (!res.ok) {{
      const err = await res.text();
      status.textContent = "Failed";
      output.textContent = err;
      btn.disabled = false;
      btn.textContent = "Retry";
      return;
    }}
    const data = await res.json();
    status.textContent = "Complete! v" + data.version;
    output.textContent = JSON.stringify(data.soul, null, 2);
    btn.textContent = "Done";
  }} catch (e) {{
    status.textContent = "Error";
    output.textContent = e.message || e;
    btn.disabled = false;
    btn.textContent = "Retry";
  }}
}}
</script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/soul")
async def get_current_soul(
    persona_id: str,
    lang: str = Query("en", description="Language: en | zh-CN"),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await _check_persona(persona_id, user.id, db)
    result = await db.execute(
        select(PersonaSoul)
        .where(PersonaSoul.persona_id == persona_id, PersonaSoul.lang == lang)
        .order_by(PersonaSoul.version.desc())
    )
    soul = result.scalars().first()
    if not soul:
        raise HTTPException(status_code=404, detail=f"No soul found for lang={lang}, run distillation first")
    return {
        "id": soul.id,
        "persona_id": soul.persona_id,
        "lang": soul.lang,
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