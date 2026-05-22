"""Export API routes."""

import json
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.db_models import Persona, PersonaSoul
from app.models.schemas import ExportRequest

router = APIRouter(prefix="", tags=["Export"])


@router.post("/export/{persona_id}")
async def export_persona(
    persona_id: str,
    data: ExportRequest,
    db: AsyncSession = Depends(get_db),
):
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
        raise HTTPException(status_code=400, detail="No soul to export")

    profile = json.loads(soul.soul_json)
    name = profile.get("basic_info", {}).get("name", persona.name)

    if data.format == "openclaw":
        content = _to_openclaw(name, profile)
        filename = f"{name}_openclaw.md"
        media_type = "text/markdown"
    elif data.format == "claude":
        content = _to_claude(name, profile)
        filename = f"{name}_claude.json"
        media_type = "application/json"
    elif data.format == "codex":
        content = _to_codex(name, profile)
        filename = f"{name}_codex.md"
        media_type = "text/markdown"
    elif data.format == "markdown":
        content = _to_markdown(name, profile)
        filename = f"{name}_agent.md"
        media_type = "text/markdown"
    else:  # json
        content = json.dumps(profile, indent=2, ensure_ascii=False)
        filename = f"{name}_persona.json"
        media_type = "application/json"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


def _to_openclaw(name: str, profile: dict) -> str:
    """Export as OpenClaw SOUL.md format."""
    bi = profile.get("basic_info", {})
    p = profile.get("personality", {})
    cs = profile.get("communication_style", {})
    dp = profile.get("decision_patterns", {})

    lines = [
        f"# {name}'s SOUL.md",
        "",
        f"**Name:** {bi.get('name', name)}",
        f"**Title:** {bi.get('title', '')}",
        f"**Company:** {bi.get('company', '')}",
        f"**Background:** {bi.get('background', '')}",
        "",
        "## Personality",
        f"- Extrovert Level: {p.get('extrovert_level', 0)}/10",
        f"- Rational Level: {p.get('rational_level', 0)}/10",
        f"- Risk Tolerance: {p.get('risk_tolerance', 0)}/10",
        f"- Description: {p.get('description', '')}",
        "",
        "## Communication Style",
        f"- Formal Level: {cs.get('formal_level', 0)}/10",
        f"- Tone: {cs.get('tone', '')}",
        f"- Common Phrases: {', '.join(cs.get('common_phrases', []))}",
        f"- Preferred Channels: {', '.join(cs.get('preferred_channels', []))}",
        "",
        "## Knowledge Areas",
    ]
    for area in profile.get("knowledge_areas", []):
        lines.append(f"- {area}")

    lines.extend([
        "",
        "## Decision Patterns",
        f"- Priority Framework: {dp.get('priority_framework', '')}",
        f"- Risk Approach: {dp.get('risk_approach', '')}",
        f"- Decision Speed: {dp.get('decision_speed', '')}",
        "",
        "## Values",
    ])
    for v in profile.get("values", []):
        lines.append(f"- {v}")

    return "\n".join(lines)


def _to_claude(name: str, profile: dict) -> str:
    """Export as Claude project knowledge format."""
    return json.dumps({
        "project_knowledge": {
            "name": name,
            "persona": profile,
        }
    }, indent=2, ensure_ascii=False)


def _to_codex(name: str, profile: dict) -> str:
    """Export as system prompt template."""
    return f"""You are acting as {name}. Follow this persona strictly.

{json.dumps(profile, indent=2, ensure_ascii=False)}

Key principles:
1. Always respond in {name}'s communication style
2. Apply {name}'s decision-making framework when analyzing problems
3. Reference {name}'s knowledge areas when relevant
4. Stay consistent with {name}'s personality traits
"""


def _to_markdown(name: str, profile: dict) -> str:
    """Export as AI Agent prompt format — English, directly usable as system prompt."""
    bi = profile.get("basic_info", {})
    p = profile.get("personality", {})
    cs = profile.get("communication_style", {})
    dp = profile.get("decision_patterns", {})
    ka = profile.get("knowledge_areas", [])
    values = profile.get("values", [])

    lines = [
        f"# {name}",
        "",
        _section("Identity", [
            f"**Name:** {bi.get('name', name)}",
            f"**Title:** {bi.get('title', '')}",
            f"**Background:** {bi.get('background', '')}",
        ]),
        _section("Personality", [
            f"Extrovert Level: {p.get('extrovert_level', 0)}/10",
            f"Rational Level: {p.get('rational_level', 0)}/10",
            f"Risk Tolerance: {p.get('risk_tolerance', 0)}/10",
            f"Description: {p.get('description', '')}",
        ]),
        _section("Communication Style", [
            f"**Tone:** {cs.get('tone', '')}",
            f"**Formality:** {cs.get('formal_level', 0)}/10",
            f"**Common Phrases:** {', '.join(cs.get('common_phrases', [])) or 'N/A'}",
            f"**Preferred Channels:** {', '.join(cs.get('preferred_channels', [])) or 'N/A'}",
        ]),
    ]

    if ka:
        lines.append(_section("Knowledge Areas", [f"- {area}" for area in ka]))

    if dp:
        lines.append(_section("Decision Patterns", [
            f"**Priority Framework:** {dp.get('priority_framework', '')}",
            f"**Risk Approach:** {dp.get('risk_approach', '')}",
            f"**Decision Speed:** {dp.get('decision_speed', '')}",
        ]))

    if values:
        lines.append(_section("Values", [f"- {v}" for v in values]))

    return "\n".join(lines)


def _section(title: str, items: list) -> str:
    content = "\n".join(f"  {item}" if item.startswith("  ") else item for item in items)
    return f"## {title}\n\n{content}"
