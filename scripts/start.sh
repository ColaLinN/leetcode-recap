#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
port="${RECAP_PORT:-8765}"
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || { echo 'RECAP_PORT 必须为 1024–65535'; exit 1; }
[[ -x .venv/bin/python && -f frontend/dist/index.html ]] || { echo '请先运行 ./scripts/setup.sh'; exit 1; }
mkdir -p runtime
if [[ -f runtime/server.pid ]] && kill -0 "$(cat runtime/server.pid)" 2>/dev/null; then
  echo "服务已经运行。打开 http://127.0.0.1:$port"; exit 0
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker 尚未启动：笔记和进度仍可使用，启动 Docker 后即可判题。'
fi
nohup .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port "$port" > runtime/server.log 2>&1 &
server_pid=$!
echo "$server_pid" > runtime/server.pid
for attempt in {1..40}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then cat runtime/server.log; rm -f runtime/server.pid; exit 1; fi
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null; then
    echo "已启动：http://127.0.0.1:$port"; echo '日志：runtime/server.log；停止：./scripts/stop.sh'; exit 0
  fi
  sleep 0.25
done
echo '启动超时，请查看 runtime/server.log'; exit 1
