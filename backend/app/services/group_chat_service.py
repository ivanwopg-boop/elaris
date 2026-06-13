"""Group chat service — multi-persona conversation with SSE streaming."""

import json
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import Persona, PersonaSoul, GroupChat, GroupChatMessage
from app.core.minimax_client import minimax_client
from app.core.group_chat_prompts import (
    GROUP_CHAT_SYSTEM_PROMPT,
    GROUP_CHAT_USER_PROMPT,
    GROUP_CHAT_FIRST_PROMPT,
)


def _now():
    return datetime.now(timezone.utc)


async def create_chat(
    title: str, persona_ids: list[str],
    persona_roles: dict[str, str], db: AsyncSession,
    user_id: str | None = None,
) -> GroupChat:
    chat = GroupChat(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        persona_ids=json.dumps(persona_ids),
        persona_roles=json.dumps(persona_roles, ensure_ascii=False),
    )
    db.add(chat)
    await db.flush()
    return chat


async def add_user_message(chat_id: str, message: str, db: AsyncSession) -> GroupChatMessage:
    msg = GroupChatMessage(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        sender_type="user",
        sender_id="user",
        sender_name="Me",
        content=message,
        round_number=0,
        created_at=_now(),
    )
    db.add(msg)
    await db.flush()
    return msg


# === Output sanitizer: remove bracketed stage directions ===
import re as _re

# Only match bracketed emotion/action descriptions: (smiles) （叹气）(winks)
_BRACKET_RE = _re.compile(r'[\(（][^)）]{1,40}?[\)）]')

def _sanitize_reply(text: str) -> str:
    """Remove bracketed stage directions and markdown formatting from AI reply."""
    if not text:
        return text
    # Remove bracketed actions/emotions: (smiling) （叹气）
    text = _BRACKET_RE.sub("", text)
    # Remove markdown bold/italic: **text** __text__ *text* _text_
    text = _re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # **bold**
    text = _re.sub(r"__(.+?)__", r"\1", text)          # __bold__
    text = _re.sub(r"\*(.+?)\*", r"\1", text)         # *italic*
    text = _re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", text)  # _italic_ (not in words)
    # Remove markdown headers: ### Title
    text = _re.sub(r"^#{1,6}\s+", "", text, flags=_re.MULTILINE)
    # Remove markdown links but keep text: [text](url) -> text
    text = _re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Collapse multiple spaces
    text = _re.sub(r" {2,}", " ", text)
    return text.strip()

async def run_group_chat_stream(
    chat_id: str, user_message: str, db: AsyncSession,
    search_context: str = "",
) -> AsyncGenerator[dict, None]:
    """Generate persona responses as SSE events. search_context is ignored —
    each persona does its own web search inside _call_one."""
    # Load chat
    result = await db.execute(select(GroupChat).where(GroupChat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        yield {"type": "error", "message": "Group chat not found"}
        return

    persona_ids = json.loads(chat.persona_ids)
    persona_roles = json.loads(chat.persona_roles) if chat.persona_roles else {}

    # Load all existing messages for context
    msg_result = await db.execute(
        select(GroupChatMessage)
        .where(GroupChatMessage.chat_id == chat_id)
        .order_by(GroupChatMessage.created_at)
    )
    all_messages = msg_result.scalars().all()

    # Load personas with souls
    personas = []
    for pid in persona_ids:
        pr = await db.execute(select(Persona).where(Persona.id == pid))
        p = pr.scalar_one_or_none()
        if not p:
            continue
        sr = await db.execute(
            select(PersonaSoul)
            .where(PersonaSoul.persona_id == pid)
            .order_by(PersonaSoul.version.desc())
        )
        soul = sr.scalars().first()
        personas.append({
            "id": pid,
            "name": p.name,
            "source_name": p.source_name or "",
            "soul": json.loads(soul.soul_json) if soul else {},
            "has_soul": soul is not None,
            "role": persona_roles.get(pid, ""),
        })

    if not personas:
        yield {"type": "error", "message": "No valid personas found"}
        return

    # Check for @mentions in user message
    import re
    mentioned = set()
    user_msg_text = user_message
    for p in personas:
        pattern = rf'@{re.escape(p["name"])}\b'
        if re.search(pattern, user_message):
            mentioned.add(p["id"])
            # Remove @name from message text sent to AI
            user_msg_text = re.sub(pattern, p["name"], user_msg_text)

    # Filter personas: only mentioned ones respond, or all if no mentions
    if mentioned:
        active_personas = [p for p in personas if p["id"] in mentioned]
        yield {"type": "info", "message": f"@ed {len(active_personas)} people"}
    else:
        active_personas = personas

    # Determine round number
    max_round = max((m.round_number for m in all_messages), default=0)
    round_num = max_round + 1

    # Build full conversation history from all previous messages
    full_history = ""
    prev_msgs = [m for m in all_messages if m.sender_type != "user" or m.content != user_message]
    if prev_msgs:
        parts = []
        for m in prev_msgs:
            role = "User" if m.sender_type == "user" else m.sender_name
            parts.append(f"[{role}]: {m.content}")
        full_history = "\n\n".join(parts)

    import asyncio

    async def _call_one(persona: dict) -> dict:
        try:
            # ── Per-persona web search (V2) ──
            # Each @'d persona queries for its own latest context. If no @mentions
            # exist, every active persona searches so the question is fair to all.
            # Query = persona name + recent chat context + current user message + "2026".
            persona_search_context = ""
            # Gate: search only when there are no @mentions (everyone responds),
            # or when this specific persona is in the @mentioned set.
            should_search = (not mentioned) or (persona["id"] in mentioned)
            if should_search:
                try:
                    from app.services.web_search import search_web
                    import logging
                    _log = logging.getLogger("uvicorn")
                    from datetime import datetime as _dt; _tp = _dt.now(); _today = _tp.strftime("%Y-%m-%d")
                    search_name = persona.get('source_name') or persona['name']
                    _rp = "Search keywords: " + search_name + " OR " + search_name + ". Question to research: '" + user_msg_text + "'. Current date: " + _today + ". Give me ONLY two search-engine-ready query strings, exactly like:  'keyword1 keyword2 keyword3 2026'. Use " + search_name + "'s real name. Factor in that we are past " + _today + ". Your ENTIRE RESPONSE must be exactly 2 lines, each line a search query. No explanations, no thinking, no prefix."
                    _rr = await minimax_client.chat(
                        [{"role": "user", "content": _rp}], temperature=0.1, max_tokens=150
                    )
                    _rlines = [l.strip() for l in _rr.strip().split("\n") if l.strip()]
                    _bad_prefixes = ('we need', 'we should', 'the question', 'the user', 'possible',
                                     'interpret', 'so we', 'so the', 'use real', 'first query',
                                     'second query', 'query 1', 'query 2', 'we can', 'here are',
                                     'let me', 'i need', 'i will', 'output',
                                     '我们需要', '问题', '可以', '这样', '首先', '然后')
                    _lowered = [l.lower() for l in _rlines]
                    _kept = [l for i, l in enumerate(_rlines)
                             if not _lowered[i].startswith(_bad_prefixes)
                             and len(l) >= 10
                             and 'keyword' not in _lowered[i]]
                    if len(_kept) >= 2:
                        _qs = _kept[:2]
                    else:
                        _topic_words = []
                        _topic_msg = (user_msg_text + " ").replace("?", " ").replace("？", " ").replace("!", " ")
                        for _w in _topic_msg.split():
                            _w = _w.strip()
                            if len(_w) >= 2 and _w not in ("你", "我", "他", "她", "的", "了", "吗", "呢", "啊", "吧", "是", "在", "有", "不", "就", "也", "还", "都", "要", "会", "能", "可以", "什么", "怎么", "为什么", "哪个", "哪里", "谁", "什么时候", "有没有", "是不是", "能不能", "现在", "最近", "最新", "一下", "今天", "昨天", "明天"):
                                if _w not in _topic_words:
                                    _topic_words.append(_w)
                        _topics = " ".join(_topic_words[:3])
                        _qs = [
                            search_name + " " + _topics + " " + str(_tp.year),
                            search_name + " " + _topics
                        ]
                    _log.info(f"[SEARCH_Q] name={persona['name']} raw={user_msg_text[:40]!r} -> {_qs}")
                    _sr = await search_web(_qs)
                    _hits = 0
                    if _sr:
                        _seen = set()
                        _parts = ["\n### Live web search results (just retrieved, for you):"]
                        for _qr in _sr:
                            for r in _qr.get("results", []):
                                _u = r.get("url", "")
                                if _u and _u not in _seen and r.get("snippet"):
                                    _seen.add(_u)
                                    _parts.append(f"- **{r['title']}**: {r['snippet'][:200]}")
                                    _hits += 1
                                    if _hits >= 6:
                                        break
                            if _hits >= 6:
                                break
                        if _hits > 0:
                            persona_search_context = "\n".join(_parts)
                    _log.info(
                        f"[PERSONA_SEARCH] name={persona['name']} q={_qs[0][:60]!r} hits={_hits}"
                    )
                except Exception as _se:
                    import logging
                    logging.getLogger("uvicorn").error(
                        f"[PERSONA_SEARCH_ERROR] name={persona['name']} {_se}"
                    )
            if full_history:
                up = GROUP_CHAT_USER_PROMPT.format(
                    chat_title=chat.title,
                    user_message=user_msg_text,
                    context=f"## Previous Chat History\n{full_history}")
            else:
                up = GROUP_CHAT_FIRST_PROMPT.format(
                    chat_title=chat.title, user_message=user_msg_text)
            sp = GROUP_CHAT_SYSTEM_PROMPT.format(
                persona_name=persona["name"],
                soul_json=json.dumps(persona["soul"], indent=2, ensure_ascii=False),
                role=persona["role"],
                search_context=persona_search_context or "(No live web search results — answer from your knowledge and the conversation history.)")
            reply = await asyncio.wait_for(
                minimax_client.chat(
                    [{"role": "system", "content": sp}, {"role": "user", "content": up}],
                    temperature=0.5, max_tokens=10000),
                timeout=120)
            return {"persona_name": persona["name"], "persona_id": persona["id"], "content": _sanitize_reply(reply)}
        except asyncio.TimeoutError:
            return {"persona_name": persona["name"], "persona_id": persona["id"], "content": f"（{persona['name']}正在思考中...）"}
        except Exception as e:
            return {"persona_name": persona["name"], "persona_id": persona["id"], "content": f"（{persona['name']}暂时无法回应）"}

    for persona in active_personas:
        yield {"type": "thinking", "persona_name": persona["name"]}

    tasks = [_call_one(p) for p in active_personas]
    for coro in asyncio.as_completed(tasks):
        result = await coro
        msg = GroupChatMessage(
            id=str(uuid.uuid4()), chat_id=chat_id, sender_type="persona",
            sender_id=result["persona_id"], sender_name=result["persona_name"],
            content=result["content"], round_number=round_num, created_at=_now())
        db.add(msg)
        await db.commit()  # Commit so polling can see it
        yield {"type": "message", "persona_name": result["persona_name"],
               "persona_id": result["persona_id"], "content": result["content"]}


    await db.flush()
    yield {"type": "done"}
