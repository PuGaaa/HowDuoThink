#!/bin/bash
# 本地开发启动脚本：固定 JWT_SECRET（重启不掉登录态）+ ENV=dev
cd "$(dirname "$0")"
# venv 必须是 Python 3.12（对齐生产镜像与 CI）：不符给出重建命令并拒绝启动
if ! .venv/bin/python --version 2>/dev/null | grep -q "Python 3\.12"; then
  echo "dev venv 必须是 Python 3.12（对齐生产镜像与 CI）。重建："
  echo "  rm -rf .venv && uv venv .venv --python 3.12 --seed && .venv/bin/pip install -r requirements-dev.lock"
  exit 1
fi
# 密钥等本地机密放 .env.dev.local（gitignored），勿写进本文件
[ -f .env.dev.local ] && set -a && . ./.env.dev.local && set +a
if [ -z "${JWT_SECRET:-}" ]; then
  echo "缺少 JWT_SECRET，请写入 server/.env.dev.local"
  exit 1
fi
export ENV=dev
exec "$(dirname "$0")/.venv/bin/uvicorn" main:app --port 8000
