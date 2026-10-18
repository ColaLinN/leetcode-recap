#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for tool in python3 node npm docker; do
  command -v "$tool" >/dev/null || { echo "缺少 $tool，请先安装。"; exit 1; }
done
if ! docker info >/dev/null 2>&1; then
  echo '请先启动 Docker Desktop 或 OrbStack，再重新执行。'
  exit 1
fi
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
docker build -t recap-python:local backend/judge
echo '准备完成。运行 ./scripts/start.sh 启动。'
