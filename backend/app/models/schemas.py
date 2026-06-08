"""Pydantic schemas for request / response validation."""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, field_validator, Field


# ── PersonaProfile (soul_json structure) ─────────────────
class BasicInfo(BaseModel):
    name: str = ""
    title: str = ""
    company: str = ""
    background: str = ""


class Personality(BaseModel):
    extrovert_level: int | None = None
    rational_level: int | None = None
    risk_tolerance: int | None = None
    description: str = ""


class CommunicationStyle(BaseModel):
    formal_level: int | None = None
    tone: str = ""
    common_phrases: list[str] = []
    preferred_channels: list[str] = []


class DecisionPatterns(BaseModel):
    priority_framework: str | None = None
    risk_approach: str | None = None
    decision_speed: str | None = None


class MentalModel(BaseModel):
    name: str = ""
    description: str = ""  # One-line description
    evidence: list[str] = []  # At least 2 cross-domain pieces of evidence
    application: str = ""  # What scenario to use it in
    limitation: str = ""  # When it fails

    @field_validator("evidence", mode="before")
    @classmethod
    def coerce_evidence(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            return v
        return []


class ExpressionDNA(BaseModel):
    avg_sentence_length: float | None = None
    question_ratio: float | None = None
    analogy_density: float | None = None
    first_person_ratio: float | None = None
    certainty_ratio: float | None = None
    transition_frequency: float | None = None
    style_tags: list[str] = []
    common_phrases: list[str] = []
    taboo_words: list[str] = []


class CoreTension(BaseModel):
    description: str = ""
    evidence: list[str] = []


class PersonaProfile(BaseModel):
    basic_info: BasicInfo = BasicInfo()
    personality: Personality = Personality()
    communication_style: CommunicationStyle = CommunicationStyle()
    knowledge_areas: list[str] = []
    decision_patterns: DecisionPatterns = DecisionPatterns()
    values: list[str] = []

    # Deep extraction (Nuwa-inspired)
    mental_models: list[MentalModel] = []
    expression_dna: ExpressionDNA = ExpressionDNA()
    decision_heuristics: list[str] = []
    core_tensions: list[CoreTension] = []
    honest_limitations: list[str] = []

    @field_validator("core_tensions", mode="before")
    @classmethod
    def coerce_core_tensions(cls, v: Any) -> list[Any]:
        if isinstance(v, list):
            result = []
            for item in v:
                if isinstance(item, str):
                    result.append({"description": item, "evidence": []})
                else:
                    result.append(item)
            return result
        return v

    @field_validator("mental_models", mode="before")
    @classmethod
    def coerce_mental_models(cls, v: Any) -> list[Any]:
        if isinstance(v, list):
            result = []
            for item in v:
                if isinstance(item, str):
                    result.append({"name": item, "description": item, "evidence": [], "application": "", "limitation": ""})
                else:
                    result.append(item)
            return result
        return v


# ── Persona CRUD ─────────────────────────────────────────
class PersonaCreate(BaseModel):
    name: str
    description: str | None = None
    avatar_url: str | None = None
    source_id: str | None = None  # If set, copy soul from this preset persona


class PersonaUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    avatar_url: str | None = None


class PersonaOut(BaseModel):
    id: str
    name: str
    category: str | None = None
    description: str | None
    avatar_url: str | None
    created_at: datetime
    updated_at: datetime
    has_soul: bool = False
    user_id: str | None = None  # NULL = preset persona

    model_config = {"from_attributes": True}


class PersonaDetail(PersonaOut):
    soul: dict | None = None  # current language soul
    file_count: int = 0
    soul_version: int | None = None
    souls_by_lang: dict[str, dict] = {}  # {"en": {version, has_soul}, "zh-CN": {...}}


# ── File ─────────────────────────────────────────────────
class FileOut(BaseModel):
    id: str
    persona_id: str
    file_name: str
    file_type: str
    file_size: int
    parsed_content: str | None
    upload_batch: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    upload_id: str
    files: list[FileOut]


# ── Manual Input ─────────────────────────────────────────
class ManualInputCreate(BaseModel):
    fields: dict[str, str]  # field_key -> field_value


class ManualInputOut(BaseModel):
    id: str
    persona_id: str
    field_key: str
    field_value: str
    source_batch: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Web Search ───────────────────────────────────────────
class WebSearchRequest(BaseModel):
    queries: list[str]


class WebSearchResultOut(BaseModel):
    id: str
    persona_id: str
    query: str
    results_json: str
    search_batch: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Distillation ─────────────────────────────────────────
class DistillResponse(BaseModel):
    persona_id: str
    version: int
    soul: dict = {}
    souls: dict = {}
    sources_used: int


class SoulOut(BaseModel):
    id: str
    persona_id: str
    version: int
    soul_json: str
    distill_source_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Chat / Write / Advise ────────────────────────────────
class ChatRequest(BaseModel):
    persona_id: str
    message: str
    mode: str = "chat"  # chat | write | advise
    context: str | None = None  # for write/advise mode


class ChatResponse(BaseModel):
    message: str
    sources: list[str] = []
    style_match: float | None = None


# ── Export ───────────────────────────────────────────────
class ExportRequest(BaseModel):
    format: str = "json"  # openclaw | claude | codex | json


# ── Brainstorm ───────────────────────────────────────────
class BrainstormTopicItem(BaseModel):
    title: str
    detail: str = ""


class BrainstormCreate(BaseModel):
    title: str
    topic: str  # single topic, discussion starts immediately
    topic_detail: str = ""
    persona_ids: list[str] = Field(..., min_length=2)
    persona_roles: dict[str, str] = Field(default_factory=dict)
    max_rounds: int = Field(default=20, ge=1, le=20)


class BrainstormAddTopic(BaseModel):
    title: str
    detail: str = ""


class BrainstormStartRequest(BaseModel):
    topic: str = ""  # topic to discuss, required if session has no topics yet


class BrainstormSessionOut(BaseModel):
    id: str
    title: str
    topics: list[BrainstormTopicItem]
    persona_ids: list[str]
    persona_roles: dict[str, str]
    max_rounds: int
    status: str
    completed_rounds: int
    summary: str | None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BrainstormMessageOut(BaseModel):
    id: str
    session_id: str
    round_number: int
    persona_id: str
    persona_name: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BrainstormDetail(BaseModel):
    session: BrainstormSessionOut
    messages: list[BrainstormMessageOut]


class ExportBrainstormRequest(BaseModel):
    format: str = "docx"  # docx


# ── Group Chat ───────────────────────────────────────────
class GroupChatCreate(BaseModel):
    title: str
    persona_ids: list[str] = Field(..., min_length=1)
    persona_roles: dict[str, str] = Field(default_factory=dict)


class GroupChatOut(BaseModel):
    id: str
    title: str
    persona_ids: list[str]
    persona_roles: dict[str, str]
    persona_names: dict[str, str] = {}  # pid -> name for @ list
    status: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GroupChatMessageOut(BaseModel):
    id: str
    chat_id: str
    sender_type: str
    sender_id: str
    sender_name: str
    content: str
    round_number: int
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupChatDetail(BaseModel):
    chat: GroupChatOut
    messages: list[GroupChatMessageOut]


class GroupChatSendRequest(BaseModel):
    message: str


class GroupChatInviteRequest(BaseModel):
    persona_id: str


# ── Elaris Cognitive Profile v2 ──────────────────────────────
class Identity(BaseModel):
    name: str = ""
    known_as: list[str] = []
    title: str = ""
    organization: str = ""
    life_arc: str = ""
    self_description: str = ""
    how_the_world_sees_them: str = ""
    what_they_refuse_to_be_labelled_as: list[str] = []


class CognitiveArchitecture(BaseModel):
    core_beliefs: list[str] = []
    provisional_beliefs: list[str] = []
    contradictory_beliefs: list[dict] = []
    axioms: list[str] = []
    what_they_know_for_certain: list[str] = []
    what_they_suspect_but_never_state: list[str] = []
    what_they_publicly_contradicted: list[dict] = []


class PerceptualFramework(BaseModel):
    primary_lens: str = ""
    secondary_lenses: list[str] = []
    mental_models: list[dict] = []


class EmotionalReactiveSystem(BaseModel):
    triggers: list[str] = []
    dormant_points: list[str] = []
    self_protection_mechanisms: list[str] = []
    under_stress: str = ""
    when_agreed_with: str = ""
    when_challenged: str = ""


class Expertise(BaseModel):
    deep_domains: list[str] = []
    competent_domains: list[str] = []
    common_misperceptions: list[str] = []
    what_they_reject_or_oppose: list[dict] = []
    cross_domain_syntheses: list[str] = []


class KnowledgeBoundaries(BaseModel):
    explicitly_out_of_scope: list[str] = []
    will_defer_on: list[str] = []
    will_decline_to_answer: list[str] = []
    responds_to_uncertainty_with: str = "admit_not_knowing"


class CommunicationProfile(BaseModel):
    default_register: str = ""
    written_vs_spoken: dict = {}
    to_strangers_vs_intimates: dict = {}
    in_public_forum: str = ""
    signature_expressions: list[str] = []
    words_they_hardenly_ever_use: list[str] = []
    sentence_rhythm: dict = {}
    punctuation_habits: str = ""
    how_they_use_silence: str = ""
    humor_register: str = ""


class ContextualModulation(BaseModel):
    when_purpose_is_clarity_vs_impress: str = ""
    when_audience_is_hostile: str = ""
    when_audience_is_skeptical: str = ""
    when_audience_is_uninformed: str = ""
    when_being_recorded: str = ""
    when_speaking_to_detractors: str = ""


class RelationshipDynamics(BaseModel):
    with_mentees: str = ""
    with_peers: str = ""
    with_authorities: str = ""
    with_institutions: str = ""
    with_fans_public: str = ""
    with_critics: str = ""


class VoiceSamples(BaseModel):
    on_topic_they_love: str = ""
    on_topic_they_resist: str = ""
    on_topic_they_decline: str = ""
    when_explaining_something_complex: str = ""
    when_pushed_on_a_contradiction: str = ""


class TemporalProfile(BaseModel):
    how_they_changed_over_time: str = ""
    what_would_change_if_lived_another_decade: str = ""
    what_they_regret_not_saying_sooner: str = ""


class CognitiveProfileV2(BaseModel):
    schema_version: str = "2.0"
    identity: Identity = Identity()
    cognitive_architecture: CognitiveArchitecture = CognitiveArchitecture()
    perceptual_frameworks: PerceptualFramework = PerceptualFramework()
    emotional_reactive_system: EmotionalReactiveSystem = EmotionalReactiveSystem()
    expertise: Expertise = Expertise()
    knowledge_boundaries: KnowledgeBoundaries = KnowledgeBoundaries()
    communication_profile: CommunicationProfile = CommunicationProfile()
    contextual_modulation: ContextualModulation = ContextualModulation()
    relationship_dynamics: RelationshipDynamics = RelationshipDynamics()
    voice_samples: VoiceSamples = VoiceSamples()
    temporal_profile: TemporalProfile = TemporalProfile()
