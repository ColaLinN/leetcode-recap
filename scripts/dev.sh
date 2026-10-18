#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -x .venv/bin/python ]] || { echo '请先运行 ./scripts/setup.sh'; exit 1; }
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765 --reload &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
npm --prefix frontend run dev -- --host 127.0.0.1
