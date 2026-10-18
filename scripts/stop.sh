#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f runtime/server.pid ]]; then echo '服务未由启动脚本运行。'; exit 0; fi
server_pid="$(cat runtime/server.pid)"
if kill -0 "$server_pid" 2>/dev/null; then
  args="$(ps -p "$server_pid" -o command=)"
  if [[ "$args" != *'uvicorn backend.app:app'* ]]; then echo 'PID 已被其他程序占用，未停止它。'; exit 1; fi
  kill "$server_pid"
fi
rm -f runtime/server.pid
echo '已停止。'
