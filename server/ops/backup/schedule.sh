#!/usr/bin/env bash
# 启动即备份，然后每隔 BACKUP_INTERVAL_SECONDS 秒执行；单次失败使容器退出。
source "$(dirname "$0")/common.sh"
: "${BACKUP_DIR:?}" "${BACKUP_INTERVAL_SECONDS:?}" "${BACKUP_RETENTION_DAYS:?}"
mark_failed() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    printf 'FAILED\n' > "$BACKUP_DIR/last-status"
    log "scheduler FAILED exit=$exit_code"
  fi
}
trap mark_failed EXIT
while true; do
  "$(dirname "$0")/backup.sh"
  date -u +%FT%TZ > "$BACKUP_DIR/.last-success.tmp"
  mv "$BACKUP_DIR/.last-success.tmp" "$BACKUP_DIR/last-success"
  printf 'OK\n' > "$BACKUP_DIR/last-status"
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'hdx-*' \
    -mmin "+$((BACKUP_RETENTION_DAYS * 1440))" -exec rm -rf {} +
  sleep "$BACKUP_INTERVAL_SECONDS"
done
