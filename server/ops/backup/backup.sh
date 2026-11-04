#!/usr/bin/env bash
# 单次备份：失败非零、临时目录清理，成功后整组产物原子发布。
source "$(dirname "$0")/common.sh"
: "${MYSQL_DATABASE:?}" "${BACKUP_DIR:?}"
mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temp=$(mktemp -d "$BACKUP_DIR/.hdx-$stamp-XXXXXX")
cleanup() {
  local code=$?
  rm -rf "$temp"
  if (( code != 0 )); then log "backup FAILED exit=$code source=$MYSQL_DATABASE"; fi
  exit "$code"
}
trap cleanup EXIT
assert_project_schema "$MYSQL_DATABASE"
dump_sql "$MYSQL_DATABASE" "$temp/database.sql"
assert_single_database_dump "$temp/database.sql"
manifest "$temp/database.sql" > "$temp/manifest.tsv"
printf 'created_utc\t%s\nsource_database\t%s\nmysql_version\t%s\n' \
  "$stamp" "$MYSQL_DATABASE" "$(query "$MYSQL_DATABASE" 'SELECT VERSION()')" > "$temp/info.tsv"
query "$MYSQL_DATABASE" "SELECT 'database_charset',DEFAULT_CHARACTER_SET_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE();
 SELECT 'database_collation',DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE();" >> "$temp/info.tsv"
gzip -n "$temp/database.sql"
gzip -t "$temp/database.sql.gz"
(cd "$temp" && sha256sum database.sql.gz manifest.tsv info.tsv > SHA256SUMS)
final="$BACKUP_DIR/${temp##*/.}"
mv "$temp" "$final"
log "backup OK artifact=$final"
printf '%s\n' "$final"
