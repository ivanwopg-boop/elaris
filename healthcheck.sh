#!/bin/bash
LOG=/opt/elaris/healthcheck.log
FAIL_FILE=/tmp/elaris_fail_count
MAX_LOG_LINES=1000

[ -f "$LOG" ] && tail -n $MAX_LOG_LINES "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
echo "$(date '+%Y-%m-%d %H:%M:%S'): checking" >> "$LOG"

# Lint guard: 禁止函数内 from app.models import (06-22 创建分身 bug 根因)
cd /opt/elaris/backend
LINT_OUT=$(python3 lint_imports.py 2>&1)
if [ $? -ne 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S'): LINT_FAIL: $LINT_OUT" >> "$LOG"
  # 严重：代码有雷区，发告警（不自动修，避免破坏性回滚）
fi

FE_OK=$(timeout 5 curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || echo '000')
BE_OK=$(timeout 5 curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health 2>/dev/null || echo '000')

FE_VALID=false
BE_VALID=false

SX_OK=$(timeout 5 curl -s -o /dev/null -w '%{http_code}' http://localhost:8888/search?q=test 2>/dev/null || echo '000')
SX_VALID=false
case "$SX_OK" in 200|303) SX_VALID=true ;; esac

BE_VALID=false
case "$FE_OK" in 200|307|304) FE_VALID=true ;; esac
case "$BE_OK" in 200) BE_VALID=true ;; esac

if $FE_VALID && $BE_VALID; then
  rm -f "$FAIL_FILE"
  echo "$(date '+%H:%M:%S'): OK (FE=$FE_OK BE=$BE_OK)" >> "$LOG"
else
  FAILS=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)
  FAILS=$((FAILS+1))
  echo "$FAILS" > "$FAIL_FILE"
  echo "$(date '+%Y-%m-%d %H:%M:%S'): WARNING: $FAILS failures (FE=$FE_OK BE=$BE_OK)" >> "$LOG"
fi

FAILS=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)
if [ "$FAILS" -ge 3 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S'): CRITICAL: $FAILS failures - restarting all" >> "$LOG"
  rm -f "$FAIL_FILE"
  sudo pm2 restart all 2>&1 | tee -a "$LOG"
fi
