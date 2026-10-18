#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f runtime/server.pid ]]; then echo '服务未由启动脚本运行。'; exit 0; fi
server_pid="$(cat runtime/server.pid)"
if kill -0 "$server_pid" 2>/dev/null; then
  args="$(ps -p "$server_pid" -o command=)"
  if [[ "$args" != *'uvicorn backend.app:app'* ]]; then echo 'PID 已被其他程序占用，未停止它。'; exit 1; fi
  kill "$server_pid"
  for attempt in {1..140}; do
    if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
    sleep 0.25
  done
  if kill -0 "$server_pid" 2>/dev/null; then
    echo '服务仍在结束当前任务，请稍后重新执行停止脚本。'; exit 1
  fi
fi
rm -f runtime/server.pid runtime/server.port
echo '已停止。'
