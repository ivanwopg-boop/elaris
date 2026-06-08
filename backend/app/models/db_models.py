"""SQLAlchemy ORM models."""

from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Float, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Persona ──────────────────────────────────────────────
class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    files: Mapped[list["PersonaFile"]] = relationship(back_populates="persona", cascade="all, delete-orphan")
    manual_inputs: Mapped[list["PersonaManualInput"]] = relationship(back_populates="persona", cascade="all, delete-orphan")
    web_searches: Mapped[list["WebSearchResult"]] = relationship(back_populates="persona", cascade="all, delete-orphan")
    souls: Mapped[list["PersonaSoul"]] = relationship(back_populates="persona", cascade="all, delete-orphan")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="persona", cascade="all, delete-orphan")


# ── PersonaFile ──────────────────────────────────────────
class PersonaFile(Base):
    __tablename__ = "persona_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(36), ForeignKey("personas.id", ondelete="CASCADE"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(256), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(32), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    parsed_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    upload_batch: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    persona: Mapped["Persona"] = relationship(back_populates="files")


# ── PersonaManualInput ───────────────────────────────────
class PersonaManualInput(Base):
    __tablename__ = "persona_manual_inputs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(36), ForeignKey("personas.id", ondelete="CASCADE"), nullable=False)
    field_key: Mapped[str] = mapped_column(String(64), nullable=False)
    field_value: Mapped[str] = mapped_column(Text, nullable=False)
    source_batch: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    persona: Mapped["Persona"] = relationship(back_populates="manual_inputs")


# ── WebSearchResult ──────────────────────────────────────
class WebSearchResult(Base):
    __tablename__ = "web_search_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(36), ForeignKey("personas.id", ondelete="CASCADE"), nullable=False)
    query: Mapped[str] = mapped_column(String(256), nullable=False)
    results_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    search_batch: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    persona: Mapped["Persona"] = relationship(back_populates="web_searches")


# ── PersonaSoul ──────────────────────────────────────────
class PersonaSoul(Base):
    __tablename__ = "persona_souls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(36), ForeignKey("personas.id", ondelete="CASCADE"), nullable=False)
    lang: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    soul_json: Mapped[str] = mapped_column(Text, nullable=False)  # full PersonaProfile JSON
    distill_source_count: Mapped[int] = mapped_column(Integer, default=0)
    distill_file_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of file ids
    distill_search_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of search ids
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    persona: Mapped["Persona"] = relationship(back_populates="souls")


# ── DistillationLog ──────────────────────────────────────
class DistillationLog(Base):
    __tablename__ = "distillation_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(36), ForeignKey("personas.id", ondelete="CASCADE"), nullable=False)
    version_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version_to: Mapped[int] = mapped_column(Integer, nullable=False)
    input_summary: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ── BrainstormSession ────────────────────────────────────
class BrainstormSession(Base):
    __tablename__ = "brainstorm_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    topics: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array: [{"title":"...", "detail":"..."}]
    persona_ids: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of persona IDs
    persona_roles: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON dict: {persona_id: role}
    max_rounds: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="created")  # created | running | completed | failed
    completed_rounds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[str] = mapped_column(Text, nullable=True)  # JSON: {"overall": str, "per_topic": {}}
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


# ── BrainstormMessage ────────────────────────────────────
class BrainstormMessage(Base):
    __tablename__ = "brainstorm_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("brainstorm_sessions.id", ondelete="CASCADE"), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    persona_id: Mapped[str] = mapped_column(String(36), nullable=False)
    persona_name: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ── BrainstormFile ───────────────────────────────────────
class BrainstormFile(Base):
    __tablename__ = "brainstorm_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("brainstorm_sessions.id", ondelete="CASCADE"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(256), nullable=False)
    parsed_content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ── GroupChat ────────────────────────────────────────────
class GroupChat(Base):
    __tablename__ = "group_chats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    persona_ids: Mapped[str] = mapped_column(Text, nullable=False)
    persona_roles: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


# ── GroupChatMessage ──────────────────────────────────────
class GroupChatMessage(Base):
    __tablename__ = "group_chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    chat_id: Mapped[str] = mapped_column(String(36), ForeignKey("group_chats.id", ondelete="CASCADE"), nullable=False)
    sender_type: Mapped[str] = mapped_column(String(16), nullable=False)
    sender_id: Mapped[str] = mapped_column(String(36), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ── User & Auth ──────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tier: Mapped[str] = mapped_column(String(16), default="free")  # "free" | "premium" | "admin"
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "google" | "twitter" | "email" | "invite"
    provider_id: Mapped[str | None] = mapped_column(String(256), nullable=True)  # OAuth sub
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)




class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    persona_id: Mapped[str] = mapped_column(String(36), nullable=False)
    type: Mapped[str] = mapped_column(String(16), default='single')
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    participant_ids: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    persona_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    sources: Mapped[str] = mapped_column(Text, default="[]")
    style_match: Mapped[float] = mapped_column(Float, default=0)

class InviteCode(Base):
    __tablename__ = "invite_codes"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    tier: Mapped[str] = mapped_column(String(16), default="premium")
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    persona_id: Mapped[str] = mapped_column(String(36), ForeignKey("personas.id", ondelete="cascade"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    persona: Mapped["Persona"] = relationship("Persona", back_populates="contacts", lazy="joined")

    __table_args__ = (
        UniqueConstraint("user_id", "persona_id", name="uq_user_persona"),
    )
