#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DIR:?}" "${BACKUP_INTERVAL_SECONDS:?}"
# 最近成功时间戳的文件年龄；失败后不能把昨天的成功继续视为健康。
[[ "$(cat "$BACKUP_DIR/last-status")" == OK ]]
last=$(stat -c %Y "$BACKUP_DIR/last-success")
(( $(date +%s) - last < BACKUP_INTERVAL_SECONDS + 3600 ))
