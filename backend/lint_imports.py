#!/usr/bin/env python3
"""
lint_imports.py - 永久护栏
禁止任何函数/方法内 'from app.models import' 形式的局部导入。

为什么有这个：
2026-06-22 创建分身报错，根因是 chat.py:458 函数内 'from app.models.db_models import ConversationMessage'，
Python 编译时把整个函数的 ConversationMessage 解析为 local，导致后续 select(ConversationMessage) 报
"cannot access free variable"。和 2026-06-17 momentum hook bug 是同一家族。
当时只修了 momentum，没扫其他文件，结果 chat.py 又爆了。

这个脚本扫描所有 app/ 下 .py，违反就非零退出。
"""
import re
import sys
from pathlib import Path

BACKEND = Path("/opt/elaris/backend/app")

# 匹配：缩进（1+ 空格或 tab） + from app.models import ...
LOCAL_RE = re.compile(
    r"^[ \t]+from app\.models(?:\.[\w]+)? import ",
    re.MULTILINE
)

def main():
    violations = []
    for py_file in BACKEND.rglob("*.py"):
        text = py_file.read_text(encoding="utf-8")
        for m in LOCAL_RE.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            violations.append((py_file, line_no, m.group(0).strip()))
    
    if violations:
        print(f"❌ 发现 {len(violations)} 处函数内 from app.models import（禁止）:")
        for f, ln, txt in violations:
            rel = f.relative_to(BACKEND.parent.parent)
            print(f"  {rel}:{ln}  {txt}")
        print("\n所有 from app.models import 必须在文件顶部。")
        sys.exit(1)
    else:
        scanned = sum(1 for _ in BACKEND.rglob("*.py"))
        print(f"✅ {scanned} 个文件全部干净，无函数内 from app.models import")
        sys.exit(0)

if __name__ == "__main__":
    main()