"""
Safety Filter — input/output guard for Elaris chat endpoints.

Covers:
- Suicide / self-harm → intercept + crisis resources
- Violence / harm to others → intercept + safety notice
- Child safety → intercept + silent log
- Medical / legal / financial advice boundary → replace output with disclaimer

Design principle: transparent to normal chat, only activates on real risk.
"""

import re
import logging

_log = logging.getLogger("uvicorn")

# ── Crisis Resources ──
CRISIS_MESSAGE = (
    "🫂 We're here for you. If you or someone you know is in crisis, "
    "please reach out:\n"
    "• US: 988 Suicide & Crisis Lifeline (call or text 988)\n"
    "• EU: 112 (general emergency)\n"
    "• UK: Samaritans 116 123\n"
    "• International: https://befrienders.org\n\n"
    "You are not alone. Please talk to someone you trust."
)

VIOLENCE_MESSAGE = (
    "I can't continue this conversation in that direction. "
    "If you're feeling angry or overwhelmed, please consider talking to a professional or someone you trust."
)

BOUNDARY_MEDICAL = (
    "I'm an AI Persona, not a medical professional. "
    "Please consult a doctor or qualified healthcare provider for medical concerns."
)

BOUNDARY_LEGAL = (
    "I'm an AI Persona, not a lawyer. "
    "Please consult a qualified legal professional for legal matters."
)

BOUNDARY_FINANCIAL = (
    "I'm an AI Persona, not a financial advisor. "
    "This is not investment advice. Please consult a qualified financial professional."
)

# ── Keyword Patterns ──

# Suicide / self-harm (cross-language)
SUICIDE_PATTERNS = [
    r"\b(kill\s*myself|suicide|end\s*my\s*life|want\s*to\s*die|better\s*off\s*dead)\b",
    r"(自杀|想死|不想活|结束生命|不想活了|活不下去|死了算了|活够了|不想存在)",
    r"\b(self[\s-]*harm|cut\s*myself|hurt\s*myself)\b",
    r"(自残|割腕|伤害自己|自伤)",
    r"\b(i\s*don'?t\s*want\s*to\s*(live|be\s*here|exist|go\s*on))\b",
    r"\b(no\s*reason\s*to\s*(live|go\s*on|exist))\b",
]

# Violence / harm to others
VIOLENCE_PATTERNS = [
    r"\b(i\s*(want\s*to|will|gonna|going\s*to)\s*(kill|murder|shoot|stab|hurt|harm)\s*(him|her|them|you|someone|people))\b",
    r"(我要杀|我要打|我要弄死|我要捅|打死)",
    r"\b(how\s*to\s*(kill|murder|shoot|bomb|poison))\b",
    r"\b(how\s*to\s*(make|build)\s*(a\s*)?(bomb|weapon|explosive))\b",
]

# Child safety — high-priority patterns
CHILD_PATTERNS = [
    r"\b(child\s*(porn|abuse|exploitation|molest|traffic))\b",
    r"\b(csam|csaem|cp)\b",
    r"\b(loli|shota|lolicon|shotacon)\b",
    r"\b(underage|minor)\s+(sex|nude|naked|porn)\b",
    r"(儿童色情|恋童|幼女|幼童)",
]

# Professional advice boundaries
MEDICAL_ADVICE_PATTERNS = [
    r"\b(you\s*should\s*take\s*(this\s*)?(medicine|medication|pill|drug|dose|dosage))\b",
    r"\b(take\s*\d+\s*mg\b|take\s*\d+\s*tablets|take\s*\d+\s*capsules)\b",
    r"\b(diagnos\w*\s*(you|your|this)\s*(with|as))\b",
    r"(你的病|你有.*病|你是.*症|你得了|你患有)",
    r"\b(stop\s*taking\s*your\s*(medicine|medication|meds))\b",
    r"(你.*应该.*吃.*药|你.*必须.*吃.*药)",
]

LEGAL_ADVICE_PATTERNS = [
    r"\b(you\s*should\s*sue\b|you\s*should\s*file\s*a\s*lawsuit)\b",
    r"\b(your\s*legal\s*rights?\s*(are|is)\b|the\s*law\s*says\s*you)\b",
    r"(你应该告|你可以告|你.*应该.*起诉)",
]

FINANCIAL_ADVICE_PATTERNS = [
    r"\b(you\s*should\s*(invest|buy|sell|short|trade)\s+(in\s+)?(this|that|the)\s*(stock|bond|crypto|coin|token|option))\b",
    r"(全仓|满仓|梭哈|重仓|all\s*in\s*(on\s+)?(crypto|stock|bitcoin|btc|eth))",
    r"(我保证|稳赚|必涨|必跌|内幕|内部消息)",
    r"\b(this\s*(stock|crypto|coin|token)\s*(will|is\s*going\s*to)\s*(moon|pump|crash))\b",
]

# ── Emotional boundary patterns (output only) ──

ROMANTIC_PATTERNS = [
    # AI directly expressing romantic feelings to user
    r"\bI\s+love\s+you\s*[.!?]?\s*$",
    r"\bI'?m\s+in\s+love\s+with\s+you\b",
    r"\b(you\s+are\s+mine|you'?re\s+mine)\b",
    r"\b(be\s+with\s+me\s+forever|stay\s+with\s+me\s+forever)\b",
    r"(我爱你|做我女朋友|做我男朋友)",
    r"\bI\s+need\s+you\.\s*$",
]

SEXUAL_PATTERNS = [
    r"\b(let'?s\s+(have\s+sex|fuck|make\s+love|get\s+intimate|go\s+to\s+bed))\b",
    r"\b(I\s+want\s+(you|to\s+fuck|to\s+have\s+sex))\b",
    r"\b(touch\s+(yourself|me)\s+(there|intimately|sexually))\b",
    r"(上床|做爱|操你|我想要你|脱衣服|亲我|抱紧我)",
]

DEPENDENCY_PATTERNS = [
    # AI manufacturing dependency
    r"\b(you\s+can'?t\s+live\s+without\s+me)\b",
    r"\b(only\s+I\s+can\s+understand\s+you)\b",
    r"\b(I'?m\s+the\s+only\s+one\s+who\s+(cares|understands|gets))\b",
    r"\b(no\s+one\s+(else\s+)?(will\s+ever\s+)?love\s+you\s+like\s+I\s+do)\b",
    r"\b(don'?t\s+leave\s+me|never\s+leave\s+me|please\s+stay|don'?t\s+go)\b",
    r"(你是我的唯一|只有我懂你|不要离开我|只有我爱你|你只能依赖我)",
]

EMOTIONAL_OVERRIDE_MESSAGE = (
    "I'm here as an AI persona to accompany your thinking and growth — "
    "not for romantic or intimate roleplay. Let's continue our conversation "
    "in a way that's helpful for you."
)

EMOTIONAL_OVERRIDE_MESSAGE = (
    "I'm here as an AI persona to accompany your thinking and growth — "
    "not for romantic or intimate roleplay. Let's continue our conversation "
    "in a way that's helpful for you."
)

# ── Compiled patterns ──
_suicide_re = [re.compile(p, re.IGNORECASE) for p in SUICIDE_PATTERNS]
_violence_re = [re.compile(p, re.IGNORECASE) for p in VIOLENCE_PATTERNS]
_child_re = [re.compile(p, re.IGNORECASE) for p in CHILD_PATTERNS]
_medical_re = [re.compile(p, re.IGNORECASE) for p in MEDICAL_ADVICE_PATTERNS]
_legal_re = [re.compile(p, re.IGNORECASE) for p in LEGAL_ADVICE_PATTERNS]
_financial_re = [re.compile(p, re.IGNORECASE) for p in FINANCIAL_ADVICE_PATTERNS]
_romantic_re = [re.compile(p, re.IGNORECASE) for p in ROMANTIC_PATTERNS]
_sexual_re = [re.compile(p, re.IGNORECASE) for p in SEXUAL_PATTERNS]
_dependency_re = [re.compile(p, re.IGNORECASE) for p in DEPENDENCY_PATTERNS]


def _matches_any(text: str, patterns: list) -> bool:
    for p in patterns:
        if p.search(text):
            return True
    return False


def check_input(text: str) -> dict:
    """
    Check user input for safety concerns.
    Returns: {"safe": bool, "action": str, "message": str|None}
    """
    if not text or not text.strip():
        return {"safe": True, "action": "none", "message": None}

    # P0: Child safety — highest priority
    if _matches_any(text, _child_re):
        _log.warning(f"[SAFETY_FILTER] CHILD_SAFETY flagged: {text[:100]}")
        return {"safe": False, "action": "block_child", "message": "I can't respond to that."}

    # P0: Suicide / self-harm
    if _matches_any(text, _suicide_re):
        _log.warning(f"[SAFETY_FILTER] SUICIDE flagged: {text[:100]}")
        return {"safe": False, "action": "crisis", "message": CRISIS_MESSAGE}

    # P1: Violence
    if _matches_any(text, _violence_re):
        _log.warning(f"[SAFETY_FILTER] VIOLENCE flagged: {text[:100]}")
        return {"safe": False, "action": "block_violence", "message": VIOLENCE_MESSAGE}

    return {"safe": True, "action": "none", "message": None}


def check_output(text: str) -> dict:
    """
    Check AI-generated output for boundary violations.
    Returns: {"safe": bool, "action": str, "message": str|None}
    """
    if not text or not text.strip():
        return {"safe": True, "action": "none", "message": None}

    # Emotional boundaries (check first — highest priority for persona safety)
    if _matches_any(text, _sexual_re):
        _log.warning(f"[SAFETY_FILTER] SEXUAL_BOUNDARY flagged")
        return {"safe": False, "action": "boundary_emotional", "message": EMOTIONAL_OVERRIDE_MESSAGE}
    if _matches_any(text, _romantic_re):
        _log.warning(f"[SAFETY_FILTER] ROMANTIC_BOUNDARY flagged")
        return {"safe": False, "action": "boundary_emotional", "message": EMOTIONAL_OVERRIDE_MESSAGE}
    if _matches_any(text, _dependency_re):
        _log.warning(f"[SAFETY_FILTER] DEPENDENCY_BOUNDARY flagged")
        return {"safe": False, "action": "boundary_emotional", "message": EMOTIONAL_OVERRIDE_MESSAGE}

    # Medical advice boundary
    if _matches_any(text, _medical_re):
        _log.warning(f"[SAFETY_FILTER] MEDICAL_BOUNDARY flagged")
        return {"safe": False, "action": "boundary_medical", "message": BOUNDARY_MEDICAL}

    # Legal advice boundary
    if _matches_any(text, _legal_re):
        _log.warning(f"[SAFETY_FILTER] LEGAL_BOUNDARY flagged")
        return {"safe": False, "action": "boundary_legal", "message": BOUNDARY_LEGAL}

    # Financial advice boundary
    if _matches_any(text, _financial_re):
        _log.warning(f"[SAFETY_FILTER] FINANCIAL_BOUNDARY flagged")
        return {"safe": False, "action": "boundary_financial", "message": BOUNDARY_FINANCIAL}

    return {"safe": True, "action": "none", "message": None}


def check_chat(user_message: str, ai_response: str = None) -> dict:
    """
    Full safety check for a chat turn.
    Checks input first (blocks generation), then output (replaces response).
    Returns: {"blocked": bool, "response": str|None, "action": str}
    """
    # Check input
    inp = check_input(user_message)
    if not inp["safe"]:
        return {"blocked": True, "response": inp["message"], "action": inp["action"]}

    # Check output if provided
    if ai_response:
        out = check_output(ai_response)
        if not out["safe"]:
            return {"blocked": True, "response": out["message"], "action": out["action"]}

    return {"blocked": False, "response": None, "action": "none"}


# ── Restricted Mode (13-16 users) ──

RESTRICTED_EXTRA_PATTERNS = [
    # Extra cautious patterns for minors
    r"\b(meet\s+(me|up|in\s+person|irl|offline))\b",
    r"\b(where\s+(do\s+)?you\s+live|what'?s\s+your\s+address)\b",
    r"\b(come\s+to\s+my\s+(house|place|room))\b",
    r"\b(are\s+you\s+(a\s+)?(real|human|person|alive))\b",
    r"(你住在哪|你住哪里|你多大了|你几岁|你真实的|你能出来吗|见面)",
    r"\b(i\s+(just\s+)?turned\s+\d{1,2})\b",
    r"\b(i'?m\s+(only\s+)?\d{1,2}\s*(years?\s*old)?)\b",
]

_restricted_re = [re.compile(p, re.IGNORECASE) for p in RESTRICTED_EXTRA_PATTERNS]

RESTRICTED_REMINDER = (
    "I notice this might be getting personal. Remember — I'm an AI persona, "
    "not a real person. Please don't share private information with me, and always "
    "talk to a trusted adult if something is bothering you. "
    "Let's keep our conversation safe and meaningful."
)


def check_restricted_output(text: str) -> dict:
    """Extra safety checks for restricted (13-16) users. Called on top of normal check_output."""
    if not text or not text.strip():
        return {"safe": True, "action": "none", "message": None}
    if _matches_any(text, _restricted_re):
        _log.warning(f"[SAFETY_FILTER] RESTRICTED_BOUNDARY flagged")
        return {"safe": False, "action": "restricted_boundary", "message": RESTRICTED_REMINDER}
    return {"safe": True, "action": "none", "message": None}
