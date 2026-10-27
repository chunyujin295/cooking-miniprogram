#!/usr/bin/env bash
# 每日数据库备份：本机保留 7 天，并向异地同步一份
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/mnt/backup/cooking}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U cooking -d cooking | gzip > "$BACKUP_DIR/cooking-$STAMP.sql.gz"

find "$BACKUP_DIR" -name 'cooking-*.sql.gz' -mtime "+$RETAIN_DAYS" -delete

if [ -n "$OFFSITE_TARGET" ]; then
  scp "$BACKUP_DIR/cooking-$STAMP.sql.gz" "$OFFSITE_TARGET"
fi

echo "backup done: $BACKUP_DIR/cooking-$STAMP.sql.gz"