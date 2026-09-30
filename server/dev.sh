#!/bin/bash
# 本地开发启动脚本：固定 JWT_SECRET（重启不掉登录态）+ ENV=dev
cd "$(dirname "$0")"
export JWT_SECRET="${JWT_SECRET:-dev-secret-please-change}"
export ENV=dev
exec /tmp/pilvenv/bin/uvicorn main:app --port 8000
