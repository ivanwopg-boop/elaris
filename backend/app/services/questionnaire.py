"""Persona questionnaire — guides users to create rich persona profiles."""

from app.core.minimax_client import minimax_client

# ── Core dimensions to explore ──
QUESTIONS = [
    {
        "key": "background_story",
        "question": "What is this person's background and key turning points?",
        "hint": "E.g.: origins, education, career, defining moments..."
    },
    {
        "key": "thinking_pattern",
        "question": "What is this person's dominant thinking style? How do they analyze problems?",
        "hint": "E.g.: first principles, reverse thinking, data-driven, intuitive... give specific examples"
    },
    {
        "key": "values_principle",
        "question": "What are this person's core values and principles? What do they care about most, what do they reject?",
        "hint": "E.g.: relentless pursuit of excellence, efficiency first, people-first, long-termism... what would this person never do?"
    },
    {
        "key": "communication_style",
        "question": "What is this person's communication and expression style?",
        "hint": "E.g.: concise or detailed? Uses many analogies? Serious or humorous tone? Any signature phrases?"
    },
    {
        "key": "decision_pattern",
        "question": "What unique methods or frameworks does this person use when making decisions?",
        "hint": "E.g.: worst-case first, rapid iteration, gather diverse opinions before deciding..."
    },
    {
        "key": "knowledge_domain",
        "question": "What domains does this person have deep knowledge in? What is their expertise?",
        "hint": "E.g.: specific technical domains, industry experience, interdisciplinary knowledge combinations..."
    },
    {
        "key": "limitation",
        "question": "What are this person's limitations or blind spots? Do they know what they don't know?",
        "hint": "E.g.: not great at socializing, biased in some areas, limited public information..."
    },
]


async def generate_followup(key: str, answer: str) -> str | None:
    """Generate a follow-up question based on user's answer."""
    prompts = {
        "background_story": f"About {answer[:100]}...what unique perspective does this background give them?",
        "thinking_pattern": f"For the thinking pattern '{answer[:80]}', can you give a concrete example?",
        "values_principle": f"Under what circumstances would they break this principle?",
        "communication_style": f"Does this expression style change under pressure?",
        "decision_pattern": f"When does this decision framework fail?",
        "knowledge_domain": f"How do these areas of expertise interact with each other?",
        "limitation": f"How do these limitations affect their judgment?",
    }
    return prompts.get(key)


def build_persona_context(answers: dict[str, str]) -> str:
    """Build a rich context string from questionnaire answers."""
    sections = []
    key_map = {
        "background_story": "Background & Experience",
        "thinking_pattern": "Thinking Style",
        "values_principle": "Values & Principles",
        "communication_style": "Communication & Expression",
        "decision_pattern": "Decision Pattern",
        "knowledge_domain": "Areas of Expertise",
        "limitation": "Cognitive Boundaries",
    }
    for key, label in key_map.items():
        if answers.get(key):
            sections.append(f"### {label}\n{answers[key]}")
    if not sections:
        return ""
    return "\n\n".join(sections)
