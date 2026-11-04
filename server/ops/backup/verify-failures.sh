#!/usr/bin/env bash
# 对备份副本制造损坏；只调用自动新库演练，不改源库。CI 与人工演练共用。
source "$(dirname "$0")/common.sh"
artifact=$1
: "${DRILL_DIR:?}"
tools=$(cd "$(dirname "$0")" && pwd)
temp=$(mktemp -d "$DRILL_DIR/failure-checks-XXXXXX")
trap 'rm -rf "$temp"' EXIT

expect_failure() {
  local label=$1 copy=$2 code result
  set +e
  "$tools/drill.sh" "$copy" > "$temp/$label.log" 2>&1
  code=$?
  set -e
  if (( code == 0 )); then log "FAILED expected rejection: $label"; exit 1; fi
  result=$(awk -F 'report=' '/restore-drill exit=/ {print $2}' "$temp/$label.log")
  case "$label" in
    sql-error|content-hash)
      grep -qx $'target_created\tEMPTY' "$result/result.tsv"
      grep -qx $'cleanup\tOK' "$result/result.tsv"
      ;;
  esac
  if [[ "$label" == content-hash ]]; then
    grep -qx $'import\tOK' "$result/result.tsv"
    grep -q 'restored schema, table counts or row hashes differ' "$temp/$label.log"
  fi
  log "expected rejection OK label=$label exit=$code"
}

cp -a "$artifact" "$temp/corrupt"
printf broken >> "$temp/corrupt/database.sql.gz"
expect_failure checksum "$temp/corrupt"

for scenario in sql-error content-hash database-selection; do
  cp -a "$artifact" "$temp/$scenario"
  gzip -dc "$temp/$scenario/database.sql.gz" > "$temp/$scenario/database.sql"
  case "$scenario" in
    sql-error) printf '\nTHIS IS INVALID SQL;\n' >> "$temp/$scenario/database.sql" ;;
    content-hash) printf "\nUPDATE cases SET payload=CONCAT(payload,' ');\n" >> "$temp/$scenario/database.sql" ;;
    database-selection) printf '\nUSE mysql;\n' >> "$temp/$scenario/database.sql" ;;
  esac
  gzip -nf "$temp/$scenario/database.sql"
  (cd "$temp/$scenario" && sha256sum database.sql.gz manifest.tsv info.tsv > SHA256SUMS)
  expect_failure "$scenario" "$temp/$scenario"
done

# 单次备份和调度器必须传播失败，且不发布半成品/不清理既有成功产物。
mkdir "$temp/failed-schedule"
mkdir "$temp/failed-schedule/hdx-keep"
for script in backup.sh schedule.sh; do
  set +e
  MYSQL_DATABASE=hdt_backup_missing_database BACKUP_DIR="$temp/failed-schedule" \
    BACKUP_INTERVAL_SECONDS=1 BACKUP_RETENTION_DAYS=7 "$tools/$script" > "$temp/$script.log" 2>&1
  code=$?
  set -e
  (( code != 0 ))
  [[ -d "$temp/failed-schedule/hdx-keep" ]]
  [[ $(find "$temp/failed-schedule" -maxdepth 1 -name '.hdx-*' | wc -l) == 0 ]]
  log "expected rejection OK label=$script exit=$code no-partial-artifact"
done
[[ $(cat "$temp/failed-schedule/last-status") == FAILED ]]
if BACKUP_DIR="$temp/failed-schedule" BACKUP_INTERVAL_SECONDS=1 "$tools/health.sh"; then
  log 'FAILED failed schedule reported healthy'; exit 1
fi

# 健康检查会拒绝超出一个周期+1小时的旧成功；无须真的等待一天。
mkdir "$temp/health"
printf 'OK\n' > "$temp/health/last-status"
date -u +%FT%TZ > "$temp/health/last-success"
BACKUP_DIR="$temp/health" BACKUP_INTERVAL_SECONDS=86400 "$tools/health.sh"
touch -d '2 days ago' "$temp/health/last-success"
if BACKUP_DIR="$temp/health" BACKUP_INTERVAL_SECONDS=86400 "$tools/health.sh"; then
  log 'FAILED stale backup reported healthy'; exit 1
fi
log 'failure checks OK: checksum, SQL, content hash, database selection, backup/schedule exit, temporary cleanup, health freshness'
