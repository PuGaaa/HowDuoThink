#!/usr/bin/env bash
# MySQL 8 运维客户端；密码只从 MYSQL_PWD 或客户端 option file 读取。
set -Eeuo pipefail
umask 077

: "${MYSQL_HOST:?}" "${MYSQL_PORT:?}" "${MYSQL_USER:?}"
client=(mysql --protocol=tcp --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --batch --skip-column-names)
dump=(mysqldump --protocol=tcp --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER"
  --single-transaction --no-tablespaces --set-gtid-purged=OFF --column-statistics=0
  --skip-comments --skip-extended-insert --complete-insert --hex-blob --order-by-primary
  --skip-add-locks --skip-disable-keys)

query() { "${client[@]}" "$1" --execute="$2"; }
digest() { sha256sum "$1" | awk '{print $1}'; }
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

assert_project_schema() {
  local unsupported
  unsupported=$(query "$1" "SELECT
    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_TYPE<>'BASE TABLE' OR ENGINE<>'InnoDB'))+
    (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE())+
    (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE())+
    (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE())+
    (SELECT COUNT(*) FROM information_schema.TABLES t WHERE TABLE_SCHEMA=DATABASE() AND NOT EXISTS
      (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA=t.TABLE_SCHEMA AND s.TABLE_NAME=t.TABLE_NAME AND s.INDEX_NAME='PRIMARY'))")
  if [[ "$unsupported" != 0 ]]; then
    log 'FAILED schema contract: require InnoDB base tables with primary keys, without stored objects'
    return 1
  fi
}

dump_sql() { "${dump[@]}" "$1" > "$2"; }

# 单条 INSERT 一行，来自同一个 single-transaction SQL 快照；不另查运行中的源库计数。
manifest() {
  local sql=$1 table rows hash
  printf 'table\trows\tsha256\n'
  while IFS= read -r table; do
    rows=$(awk -v prefix="INSERT INTO \`$table\` " 'index($0,prefix)==1 {n++} END {print n+0}' "$sql")
    hash=$(awk -v prefix="INSERT INTO \`$table\` " 'index($0,prefix)==1' "$sql" | sha256sum | awk '{print $1}')
    printf '%s\t%s\t%s\n' "$table" "$rows" "$hash"
  done < <(awk '/^CREATE TABLE `/ {split($0,a,"`"); print a[2]}' "$sql")
  # MySQL 8 重建后 SHOW CREATE 会显式补列 CHARACTER SET；COLLATE 已唯一确定字符集。
  # 仅规范列定义中这一处冗余表示，保留表/列排序规则、索引、默认值和 AUTO_INCREMENT。
  hash=$(awk '!/^INSERT INTO / {if (/^  `/) sub(/ CHARACTER SET [a-zA-Z0-9_]+ COLLATE /," COLLATE "); print}' "$sql" | sha256sum | awk '{print $1}')
  printf '__schema__\t-\t%s\n' "$hash"
}

assert_single_database_dump() {
  # 单库 dump 不应切库；恢复演练只允许写它自己创建的新库。
  if awk '/^USE |^CREATE DATABASE / {found=1} END {exit !found}' "$1"; then
    log 'FAILED dump contains database selection/creation statements'
    return 1
  fi
}
