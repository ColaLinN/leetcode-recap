#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -x .venv/bin/python ]] || { echo '请先运行 ./scripts/setup.sh'; exit 1; }
mkdir -p runtime
.venv/bin/python - <<'CHECK_PORT'
import socket
with socket.socket() as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(('127.0.0.1', 8765))
    except OSError:
        raise SystemExit('8765 端口已被占用，请先停止现有服务。')
CHECK_PORT
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765 --reload &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
ready=0
for attempt in {1..40}; do
  if ! kill -0 "$api_pid" 2>/dev/null; then echo '后端启动失败。'; exit 1; fi
  if curl -fsS --max-time 5 http://127.0.0.1:8765/api/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.25
done
if [[ "$ready" != 1 ]]; then echo '后端启动超时。'; exit 1; fi
npm --prefix frontend run dev -- --host 127.0.0.1
