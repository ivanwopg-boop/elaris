"""
Proactive Outreach Service (Phase 3: DAU Engine)
Uses raw SQLite to avoid SQLAlchemy async greenlet issues.
Periodically checks inactive user-persona pairs and sends proactive messages.
"""

import json
import uuid
import sqlite3
import logging
import os
from datetime import datetime, timezone, timedelta

_log = logging.getLogger("app.services.proactive")

DB_PATH = "/opt/elaris/backend/persona_distiller.db"

COOLDOWN_HOURS = 12
ABSENCE_HOURS = 24

PROACTIVE_PROMPT = """You are an AI persona of {persona_name}. You have built a relationship with a user.

Your relationship: Level {level}/5 ({level_name}). You have talked {msg_count} times.
What you remember: {memory_summary}

The user {scenario}.

Write ONE short message (2-4 sentences, under 150 chars) reaching out to them.
Make it feel natural — like a friend checking in. Don't be dramatic or needy.
Match your persona voice and intimacy level.

Examples:
- Stranger: "Hey, been a while since we chatted. I was just thinking about that thing you mentioned..."
- Friend: "I had a random thought about what you said the other day. Wanna hear it?"
- Close Friend: "I actually dreamed about our last conversation. When are you coming back?"

Message:"""

LEVEL_NAMES = ["Stranger", "Acquaintance", "Friend", "Close Friend", "Confidant"]


def get_level(xp):
    thresholds = [0, 100, 500, 2000, 5000]
    level = 1
    for i, t in enumerate(thresholds):
        if xp >= t:
            level = i + 1
    return min(level, 5)


async def run_proactive_check(minimax_client, limit: int = 5) -> list[dict]:
    """Main entry point: check eligible pairs and send proactive messages."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    results = []

    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=COOLDOWN_HOURS)
        absence_cutoff = now - timedelta(hours=ABSENCE_HOURS)

        # Find eligible user-persona pairs
        rows = conn.execute("""
            SELECT m.persona_id, m.user_id, m.summary, m.message_count, m.xp, m.level,
                   m.last_interacted, p.name as persona_name
            FROM persona_user_memory m
            JOIN personas p ON p.id = m.persona_id
            WHERE m.message_count >= 3
              AND m.summary IS NOT NULL AND m.summary != ''
              AND (
                m.last_interacted IS NULL
                OR datetime(m.last_interacted) < datetime(?)
              )
        """, (absence_cutoff.strftime("%Y-%m-%d %H:%M:%S"),)).fetchall()

        sent = 0
        for row in rows:
            if sent >= limit:
                break

            # Check cooldown
            recent = conn.execute("""
                SELECT 1 FROM proactive_log
                WHERE persona_id = ? AND user_id = ?
                  AND datetime(sent_at) >= datetime(?)
                LIMIT 1
            """, (row['persona_id'], row['user_id'], cutoff.strftime("%Y-%m-%d %H:%M:%S"))).fetchone()
            if recent:
                continue

            level = row['level'] or 1
            level_name = LEVEL_NAMES[min(level - 1, len(LEVEL_NAMES) - 1)]

            # Calculate absence
            if row['last_interacted']:
                try:
                    last = datetime.fromisoformat(str(row['last_interacted']))
                    hours = int((now - last).total_seconds() / 3600)
                    scenario = f"hasn't talked to you in {hours} hours"
                except:
                    scenario = "hasn't talked to you in a while"
            else:
                scenario = "hasn't talked to you in a while"

            # Generate message via LLM
            prompt = PROACTIVE_PROMPT.format(
                persona_name=row['persona_name'],
                level=level,
                level_name=level_name,
                msg_count=row['message_count'] or 0,
                memory_summary=row['summary'] or "You've talked a few times.",
                scenario=scenario,
            )

            try:
                resp = await minimax_client.chat(
                    [{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=200,
                )
                message = resp.strip().strip('"').strip()
                if len(message) < 10 or len(message) > 500:
                    _log.warning(f"[PROACTIVE] Bad message length: {len(message)}")
                    continue
            except Exception as e:
                _log.warning(f"[PROACTIVE] LLM failed: {e}")
                continue

            # Find or create conversation
            conv = conn.execute("""
                SELECT id FROM conversations
                WHERE persona_id = ? AND user_id = ? AND type = 'single'
                ORDER BY updated_at DESC LIMIT 1
            """, (row['persona_id'], row['user_id'])).fetchone()

            conv_id = conv['id'] if conv else str(uuid.uuid4())
            msg_id = str(uuid.uuid4())
            log_id = str(uuid.uuid4())
            now_str = now.strftime("%Y-%m-%d %H:%M:%S")

            if not conv:
                conn.execute("""
                    INSERT INTO conversations (id, user_id, persona_id, type, name, created_at, updated_at)
                    VALUES (?, ?, ?, 'single', ?, ?, ?)
                """, (conv_id, row['user_id'], row['persona_id'], row['persona_name'], now_str, now_str))

            # Store message
            conn.execute("""
                INSERT INTO conversation_messages (id, conversation_id, user_id, persona_id, role, content, created_at, sources, style_match, is_proactive)
                VALUES (?, ?, NULL, ?, 'assistant', ?, ?, '[]', 0.0, 1)
            """, (msg_id, conv_id, row['persona_id'], message, now_str))

            # Log
            conn.execute("""
                INSERT INTO proactive_log (id, persona_id, user_id, trigger_type, message, conversation_id, sent_at)
                VALUES (?, ?, ?, 'absence', ?, ?, ?)
            """, (log_id, row['persona_id'], row['user_id'], message, conv_id, now_str))

            conn.commit()
            results.append({
                "persona": row['persona_name'],
                "trigger": "absence",
                "message": message[:100],
            })
            sent += 1
            _log.info(f"[PROACTIVE] Sent from {row['persona_name']} to user")

    except Exception as e:
        _log.warning(f"[PROACTIVE] Error: {e}")
        conn.rollback()
    finally:
        conn.close()

    return results
