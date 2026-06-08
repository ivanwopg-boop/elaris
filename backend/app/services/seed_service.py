"""Seed preset personas into the database on first run."""

import json
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.db_models import Persona, PersonaSoul, PersonaManualInput
from app.presets import PRESET_PERSONAS


def _avatar(name: str) -> str:
    return f"https://api.dicebear.com/9.x/shapes/svg?seed={name}&backgroundColor=EAEAEF,CFCFD6,3A8FD4,9A9AA0,C2C2C8"


async def seed_presets(db: AsyncSession) -> int:
    """Seed preset personas if they don't exist. Returns count created."""
    created = 0
    for preset in PRESET_PERSONAS:
        # Check if already seeded by name
        result = await db.execute(select(Persona).where(Persona.name == preset["name"]).limit(1))
        existing = result.scalars().first()
        if existing:
            continue

        # Create persona
        pid = str(uuid.uuid4())
        persona = Persona(
            id=pid,
            name=preset["name"],
            description=preset.get("description", ""),
            avatar_url=_avatar(preset["name"]),
        )
        db.add(persona)

        # Add title as manual input
        title = preset["soul"]["basic_info"].get("title", "")
        if title:
            mi = PersonaManualInput(
                id=str(uuid.uuid4()),
                persona_id=pid,
                field_key="title",
                field_value=title,
                source_batch="preset",
            )
            db.add(mi)

        company = preset["soul"]["basic_info"].get("company", "")
        if company:
            mi = PersonaManualInput(
                id=str(uuid.uuid4()),
                persona_id=pid,
                field_key="company",
                field_value=company,
                source_batch="preset",
            )
            db.add(mi)

        # Create soul
        soul = PersonaSoul(
            id=str(uuid.uuid4()),
            persona_id=pid,
            version=1,
            soul_json=json.dumps(preset["soul"], indent=2, ensure_ascii=False),
            distill_source_count=0,
        )
        db.add(soul)
        created += 1

    await db.commit()
    return created
