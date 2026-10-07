#!/bin/bash
# 本地开发启动脚本：固定 JWT_SECRET（重启不掉登录态）+ ENV=dev
cd "$(dirname "$0")"
export JWT_SECRET="${JWT_SECRET:-dev-secret-please-change}"
export ENV=dev
# 密钥等本地机密放 .env.dev.local（gitignored），勿写进本文件
[ -f .env.dev.local ] && set -a && . ./.env.dev.local && set +a
exec "$(dirname "$0")/.venv/bin/uvicorn" main:app --port 8000
