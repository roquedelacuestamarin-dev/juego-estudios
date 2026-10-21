#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Un proceso: SQLite y bloqueos de sesión locales. No usar --workers > 1.
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-access-log
