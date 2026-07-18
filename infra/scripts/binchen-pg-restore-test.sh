#!/usr/bin/env bash
# Restore-test the most recent Binchen Postgres dump into an ephemeral container.
#
# Usage: sudo -n binchen-pg-restore-test.sh [dump-path]
#
# Boots a temporary `postgres:16-alpine` on the Coolify docker network, restores
# the given dump (default: newest file in /home/deploy/backups/bilulu-postgres/),
# runs sanity queries, prints a summary, and tears the temp container back down.
#
# Does NOT touch the production database. BIL-1548 (Backups → Restore-Test).
set -euo pipefail

BACKUP_DIR="/home/deploy/backups/bilulu-postgres"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/binchen-*.dump 2>/dev/null | head -n 1)}"
if [[ -z "${DUMP:-}" || ! -f "$DUMP" ]]; then
  echo "no dump file found (looked at $BACKUP_DIR/binchen-*.dump)" >&2
  exit 1
fi
echo "== restore-test =="
echo "dump: $DUMP"

TMP_NAME="binchen-pg-restore-test-$$"
TMP_PW="restoretest-$(date -u +%s)"

cleanup() {
  docker rm -f "$TMP_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm \
  --name "$TMP_NAME" \
  --network coolify \
  -e POSTGRES_PASSWORD="$TMP_PW" \
  -e POSTGRES_USER=binchen \
  -e POSTGRES_DB=binchen \
  postgres:16-alpine >/dev/null

# wait for readiness (up to ~30s)
for i in $(seq 1 30); do
  if docker exec "$TMP_NAME" pg_isready -U binchen >/dev/null 2>&1; then break; fi
  sleep 1
done

# stream dump into the temp container's pg_restore
docker exec -i "$TMP_NAME" pg_restore -U binchen -d binchen --no-owner --no-privileges --clean --if-exists < "$DUMP" \
  || echo "(pg_restore reported warnings — inspect for real failures)"

echo "-- table counts (top 20 by rows) --"
docker exec "$TMP_NAME" psql -U binchen -d binchen -Atc "
  SELECT schemaname||'.'||relname AS table, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 20;
"

echo "-- headline entities --"
for t in product product_variant sales_channel region shipping_option user; do
  echo -n "$t: "
  docker exec "$TMP_NAME" psql -U binchen -d binchen -Atc "SELECT COUNT(*) FROM \"$t\";" 2>/dev/null || echo "n/a"
done

echo "== restore-test done =="
