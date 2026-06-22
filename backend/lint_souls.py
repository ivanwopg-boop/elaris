#!/usr/bin/env python3
"""
lint_souls.py - DB 完整性护栏
扫描 persona_distiller.db 所有 PersonaSoul，检出空壳（schema 框架但内容全空）。
空壳灵魂 = 用户看到的"Soul 页面空白"bug 根源（2026-06-22 Ivan 报告）。

返回非零退出 = 有空壳，触发 healthcheck 告警。
"""
import json
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path("/opt/elaris/backend/persona_distiller.db")
EMPTY_SOUL_MIN_FILLED = 3  # 至少 3 个核心字段非空

def is_empty_shell(soul_data: dict) -> tuple[bool, int, int]:
    if not isinstance(soul_data, dict):
        return True, 0, 12

    identity = soul_data.get("identity") or {}
    cog = soul_data.get("cognitive_architecture") or {}
    perceptual = soul_data.get("perceptual_frameworks") or {}
    emotional = soul_data.get("emotional_reactive_system") or {}
    expertise = soul_data.get("expertise") or {}
    comm = soul_data.get("communication_profile") or {}
    voice = soul_data.get("voice_sample") or {}
    kb = soul_data.get("knowledge_boundaries") or {}

    checks = [
        bool(identity.get("name") and str(identity.get("name")).strip()),
        bool(identity.get("title") and str(identity.get("title")).strip()),
        bool(identity.get("life_arc") and str(identity.get("life_arc")).strip()),
        isinstance(cog.get("core_beliefs"), list) and len(cog.get("core_beliefs", [])) >= 2,
        isinstance(cog.get("axioms"), list) and len(cog.get("axioms", [])) >= 1,
        isinstance(expertise.get("deep_domains"), list) and len(expertise.get("deep_domains", [])) >= 2,
        bool(perceptual.get("primary_lens") and str(perceptual.get("primary_lens")).strip()),
        bool(emotional.get("under_stress") and str(emotional.get("under_stress")).strip()),
        bool(comm.get("default_register") and str(comm.get("default_register")).strip()),
        isinstance(comm.get("signature_expressions"), list) and len(comm.get("signature_expressions", [])) >= 2,
        bool(voice.get("natural_register") and str(voice.get("natural_register")).strip()) or bool(voice.get("default_tone") and str(voice.get("default_tone")).strip()),
        bool(kb.get("responds_to_uncertainty_with") and str(kb.get("responds_to_uncertainty_with")).strip()),
    ]
    filled = sum(1 for c in checks if c)
    return filled < EMPTY_SOUL_MIN_FILLED, filled, len(checks)

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true", help="删除空壳 soul 记录（保留 persona）")
    parser.add_argument("--dry-run", action="store_true", help="只列出，不删除")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"DB not found at {DB_PATH}, skipping (production may use different path)")
        sys.exit(0)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT s.id, s.persona_id, s.lang, s.version, s.soul_json, "
            "p.name, p.source_name FROM persona_souls s "
            "JOIN personas p ON p.id = s.persona_id"
        ).fetchall()
    except sqlite3.OperationalError as e:
        print(f"Schema not yet migrated (table missing?): {e}")
        sys.exit(0)

    empty = []
    for r in rows:
        try:
            data = json.loads(r["soul_json"])
        except Exception:
            empty.append((r["id"], r["persona_id"], r["name"], r["lang"], r["version"], 0, 0, "parse_error"))
            continue
        is_empty, filled, total = is_empty_shell(data)
        if is_empty:
            empty.append((r["id"], r["persona_id"], r["name"], r["lang"], r["version"], filled, total, "empty_shell"))

    if empty:
        print(f"{'❌' if not args.clean else '🧹'} 发现 {len(empty)} 个空壳 soul:")
        for sid, pid, name, lang, ver, filled, total, reason in empty:
            print(f"  soul_id={sid[:8]} persona={name!r} ({lang} v{ver}) filled={filled}/{total} reason={reason}")

        if args.clean and not args.dry_run:
            ids = [r[0] for r in empty]
            placeholders = ','.join('?' * len(ids))
            cur = conn.cursor()
            cur.execute(f"DELETE FROM persona_souls WHERE id IN ({placeholders})", ids)
            conn.commit()
            print(f"\n🗑️  已删除 {cur.rowcount} 个空壳 soul 记录（persona 保留，用户可重新蒸馏）")
            sys.exit(0)
        elif args.dry_run:
            print(f"\n(dry-run: 不会实际删除，--clean 才生效)")
            sys.exit(0)
        else:
            print(f"\n修复方案: 重跑 --clean 删除空壳 soul，或对 persona 重新蒸馏")
            sys.exit(1)
    else:
        print(f"✅ {len(rows)} 个 soul 全部充实（>= {EMPTY_SOUL_MIN_FILLED} 个核心字段）")
        sys.exit(0)

if __name__ == "__main__":
    main()