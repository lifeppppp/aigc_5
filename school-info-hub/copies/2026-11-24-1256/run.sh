#!/usr/bin/env bash
# 前台调试运行（不装 systemd）：bash run.sh
cd "$(dirname "$0")"
exec venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload