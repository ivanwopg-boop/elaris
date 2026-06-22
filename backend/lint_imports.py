#!/usr/bin/env python3
"""
lint_imports.py - 永久护栏
禁止任何函数/方法内 'from app.models import ...' 或 'import app.models.X ...' 形式。

为什么有这个：
2026-06-22 Ivan 报"创建分身报错"+"历史对话列表没了"。
- 创建分身根因：chat.py:458 函数内 'from app.models.db_models import ConversationMessage'
- 对话列表 500 根因：'from app.models.db_models import Conversation as ConvTable' 是函数内
  别名 import，被之前的清理删掉，留下了孤儿 ConvTable 引用。
第一遍修复只扫了无别名 from ... import，漏了 'as 别名' 形式，结果 17 处修了又出 15 处 ConvTable 孤儿引用。

这个脚本扫描所有 app/ 下 .py，违反任何一种形式都非零退出。
"""
import re
import sys
from pathlib import Path

BACKEND = Path("/opt/elaris/backend/app")

# 形式 1：单行函数内 from app.models(.X)? import Y [, Y2] [as Z]
LOCAL_FROM_RE = re.compile(
    r"^[ \t]+from app\.models(?:\.[\w]+)? import [^\n]+",
    re.MULTILINE
)

# 形式 2：单行函数内 import app.models.X [as Z]
LOCAL_IMPORT_RE = re.compile(
    r"^[ \t]+import app\.models\.\w+(?:\s+as\s+\w+)?",
    re.MULTILINE
)

# 形式 3：函数内 from app.models import ( 的多行括号
LOCAL_PAREN_RE = re.compile(
    r"^[ \t]+from app\.models(?:\.[\w]+)? import \(\n",
    re.MULTILINE
)

def scan_paren_blocks(text: str):
    """扫所有缩进的括号 from ... import ( ... ) 块"""
    violations = []
    for m in LOCAL_PAREN_RE.finditer(text):
        start_line = text[:m.start()].count("\n") + 1
        # 找到匹配的右括号
        depth = 1
        i = m.end()
        while i < len(text) and depth > 0:
            ch = text[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            i += 1
        end_line = text[:i].count("\n") + 1
        snippet = text[m.start():text.index("\n", m.start()) + 1] + "..." + text[max(m.start(), i - 50):i]
        violations.append((start_line, end_line, snippet.replace("\n", "\\n")))
    return violations

def main():
    violations = []
    for py_file in BACKEND.rglob("*.py"):
        text = py_file.read_text(encoding="utf-8")
        # 形式 1 + 2
        for m in LOCAL_FROM_RE.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            violations.append((py_file, line_no, m.group(0).strip()))
        for m in LOCAL_IMPORT_RE.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            violations.append((py_file, line_no, m.group(0).strip()))
        # 形式 3
        for start_line, end_line, snippet in scan_paren_blocks(text):
            violations.append((py_file, start_line, f"{snippet} (multi-line, {start_line}-{end_line})"))

    if violations:
        print(f"❌ 发现 {len(violations)} 处函数内 app.models 导入（禁止）:")
        for f, ln, txt in violations:
            rel = f.relative_to(BACKEND.parent.parent)
            print(f"  {rel}:{ln}  {txt}")
        print("\n所有 app.models 导入必须在文件顶部。")
        sys.exit(1)
    else:
        scanned = sum(1 for _ in BACKEND.rglob("*.py"))
        print(f"✅ {scanned} 个文件全部干净，无函数内 app.models 导入")
        sys.exit(0)

if __name__ == "__main__":
    main()