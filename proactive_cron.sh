#!/bin/bash
curl -sS -X POST http://localhost:8000/api/v1/personas/proactive/trigger >> /opt/elaris/proactive_cron.log 2>&1
