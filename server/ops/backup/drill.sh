#!/usr/bin/env bash
# 只恢复到本次新建的随机库，成功或失败均删除该库；从不覆盖既有库。
source "$(dirname "$0")/common.sh"
artifact=$1
: "${DRILL_DIR:?}"
mkdir -p "$DRILL_DIR"
report=$(mktemp -d "$DRILL_DIR/drill-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
target="hdt_restore_$(date -u +%Y%m%d%H%M%S)_${RANDOM}"
created=0
cleanup() {
  local code=$?
  trap - EXIT
  if (( created )); then
    if "${client[@]}" --execute="DROP DATABASE \`$target\`"; then
      printf 'cleanup\tOK\n' >> "$report/result.tsv"
    else
      printf 'cleanup\tFAILED\n' >> "$report/result.tsv"
      code=1
    fi
  fi
  rm -f "$report/source.sql" "$report/restored.sql"
  printf 'exit_code\t%s\nfinished_utc\t%s\n' "$code" "$(date -u +%FT%TZ)" >> "$report/result.tsv"
  log "restore-drill exit=$code report=$report"
  exit "$code"
}
trap cleanup EXIT
printf 'target_database\t%s\nartifact\t%s\n' "$target" "$artifact" > "$report/result.tsv"
(cd "$artifact" && sha256sum --check --status SHA256SUMS)
gzip -t "$artifact/database.sql.gz"
gzip -dc "$artifact/database.sql.gz" > "$report/source.sql"
assert_single_database_dump "$report/source.sql"
printf 'archive_integrity\tOK\n' >> "$report/result.tsv"
charset=$(awk '$1=="database_charset" {print $2}' "$artifact/info.tsv")
collation=$(awk '$1=="database_collation" {print $2}' "$artifact/info.tsv")
"${client[@]}" --execute="CREATE DATABASE \`$target\` CHARACTER SET $charset COLLATE $collation"
created=1
printf 'target_created\tEMPTY\n' >> "$report/result.tsv"
"${client[@]}" "$target" < "$report/source.sql"
printf 'import\tOK\n' >> "$report/result.tsv"
assert_project_schema "$target"
dump_sql "$target" "$report/restored.sql"
manifest "$report/restored.sql" > "$report/restored-manifest.tsv"
if [[ "$(digest "$artifact/manifest.tsv")" != "$(digest "$report/restored-manifest.tsv")" ]]; then
  log 'FAILED restored schema, table counts or row hashes differ from backup snapshot'
  exit 1
fi
printf 'snapshot_manifest\tMATCH\n' >> "$report/result.tsv"
query "$target" "SELECT 'schema_version',version_num FROM alembic_version;
 SELECT 'casepack_version',value FROM meta WHERE meta_key='casepack_version';
 SELECT 'cases_total',COUNT(*),'published',SUM(status='published'),'max_content_revision',MAX(content_revision) FROM cases;
 SELECT 'submission_materials',COUNT(*),'max_material_version',MAX(material_version),'confirmed',SUM(material_version>0 AND material_version=confirmed_version) FROM submission_reviews;
 SELECT 'progress_users',COUNT(*),'max_revision',MAX(revision) FROM progress;
 SELECT 'progress_operations',COUNT(*),'protocol_v2',SUM(protocol_version=2) FROM progress_ops;
 SELECT 'learning_events',COUNT(*) FROM learning_events;" > "$report/business.tsv"
printf 'business_summary\tRECORDED\n' >> "$report/result.tsv"
cat "$report/business.tsv"
printf 'report\t%s\n' "$report"
