#!/bin/bash
LOG=/opt/elaris/healthcheck.log
FAIL_FILE=/tmp/elaris_fail_count

echo "$(date): checking" >> $LOG

FE_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
BE_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null)

if [ "$FE_OK" != "200" ] && [ "$FE_OK" != "307" ]; then
  FAILS=$(cat $FAIL_FILE 2>/dev/null || echo 0)
  FAILS=$((FAILS+1))
  echo "$FAILS" > $FAIL_FILE
  echo "$(date): WARNING: $FAILS consecutive failures (frontend=$FE_OK backend=$BE_OK)" >> $LOG
else
  rm -f $FAIL_FILE
fi

FAILS=$(cat $FAIL_FILE 2>/dev/null || echo 0)
if [ "$FAILS" -ge 2 ]; then
  echo "$(date): CRITICAL: $FAILS failures - restarting all" >> $LOG
  rm -f $FAIL_FILE
  pm2 restart all 2>&1 | tee -a $LOG
fi
