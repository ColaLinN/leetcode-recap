#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
port="${RECAP_PORT:-8765}"
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || { echo 'RECAP_PORT 必须为 1024–65535'; exit 1; }
[[ -x .venv/bin/python && -f frontend/dist/index.html ]] || { echo '请先运行 ./scripts/setup.sh'; exit 1; }
mkdir -p runtime
if [[ -f runtime/server.pid ]] && kill -0 "$(cat runtime/server.pid)" 2>/dev/null; then
  running_pid="$(cat runtime/server.pid)"
  args="$(ps -p "$running_pid" -o command=)"
  if [[ "$args" == *'uvicorn backend.app:app'* ]]; then
    running_port="$(cat runtime/server.port 2>/dev/null || echo "$port")"
    echo "服务已经运行。打开 http://127.0.0.1:$running_port"; exit 0
  fi
  echo '旧 PID 已被其他程序占用，清理本项目的失效 PID 记录。'
  rm -f runtime/server.pid
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker 尚未启动：笔记和进度仍可使用，启动 Docker 后即可判题。'
fi
.venv/bin/python - "$port" <<'CHECK_PORT'
import socket, sys
with socket.socket() as sock:
    try:
        sock.bind(('127.0.0.1', int(sys.argv[1])))
    except OSError:
        raise SystemExit('端口已被占用，请先停止现有服务或修改 RECAP_PORT。')
CHECK_PORT
nohup .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port "$port" > runtime/server.log 2>&1 &
server_pid=$!
echo "$server_pid" > runtime/server.pid
echo "$port" > runtime/server.port
for attempt in {1..40}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then cat runtime/server.log; rm -f runtime/server.pid; exit 1; fi
  if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    echo "已启动：http://127.0.0.1:$port"; echo '日志：runtime/server.log；停止：./scripts/stop.sh'; exit 0
  fi
  sleep 0.25
done
kill "$server_pid" 2>/dev/null || true
rm -f runtime/server.pid runtime/server.port
echo '启动超时，已停止本次启动的服务，请查看 runtime/server.log'; exit 1
