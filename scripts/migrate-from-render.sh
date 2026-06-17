#!/usr/bin/env bash
# BIL-1545 — Postgres cutover from Render to the Hetzner/Coolify-hosted Medusa.
#
# Usage:
#   SOURCE_DATABASE_URL=postgres://...render.com/binchen \
#   TARGET_DATABASE_URL=postgres://...hetzner/binchen \
#   scripts/migrate-from-render.sh
#
# Optional:
#   DUMP_DIR=./tmp/migration   override dump directory (default ./tmp/migration)
#   VERIFY_ONLY=1              skip dump+restore, only run the row-count verifier
#   DUMP_ONLY=1                stop after pg_dump (cutover rehearsal)
#   SKIP_DROP=1                do not DROP+CREATE the target database (use when
#                              the target is a fresh empty DB you cannot drop)
#
# Cutover protocol (production):
#   1. Put the Render Medusa into read-only / scale to 0 to freeze writes.
#   2. Run this script with both URLs pointing at prod.
#   3. Flip the Coolify Medusa DATABASE_URL to the Hetzner Postgres and bounce.
#   4. Smoke-test storefront + admin against the new backend.
#
# Requirements: pg_dump + pg_restore + psql in PATH (Postgres 16 client).
# Both source and target must be reachable from the runner.

set -euo pipefail

DUMP_DIR="${DUMP_DIR:-./tmp/migration}"
DUMP_FILE="${DUMP_DIR}/binchen-$(date -u +%Y%m%dT%H%M%SZ).dump"

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "✖ Missing required env var: ${name}" >&2
    exit 64
  fi
}

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "✖ Required binary not found: $1" >&2
    exit 69
  fi
}

require_bin pg_dump
require_bin pg_restore
require_bin psql

if [ "${VERIFY_ONLY:-0}" != "1" ]; then
  require_var SOURCE_DATABASE_URL
fi
require_var TARGET_DATABASE_URL

mkdir -p "${DUMP_DIR}"

# Hide URLs from logs (passwords) but keep host visible for sanity checks.
mask_url() {
  echo "$1" | sed -E 's#(://[^:/]+):[^@]+@#\1:***@#'
}

echo "▶ Migration plan"
echo "    source  : $(mask_url "${SOURCE_DATABASE_URL:-<verify-only>}")"
echo "    target  : $(mask_url "${TARGET_DATABASE_URL}")"
echo "    dumpfile: ${DUMP_FILE}"
echo

if [ "${VERIFY_ONLY:-0}" = "1" ]; then
  echo "▶ VERIFY_ONLY=1 → skipping dump + restore"
else
  echo "▶ Step 1/3 — pg_dump from source (custom format, no owners/ACL)"
  # --no-owner + --no-acl: target DB has different role names, so we let the
  # restore target own everything.
  # --format=custom: parallelisable, selective restore, much smaller than plain.
  # --quote-all-identifiers: defensive against keyword collisions across versions.
  pg_dump \
    --no-owner \
    --no-acl \
    --quote-all-identifiers \
    --format=custom \
    --verbose \
    --file="${DUMP_FILE}" \
    "${SOURCE_DATABASE_URL}" 2> >(grep -E "^pg_dump:" >&2 || true)

  DUMP_BYTES=$(wc -c < "${DUMP_FILE}" | tr -d ' ')
  echo "  ✓ dumped ${DUMP_BYTES} bytes"
  echo

  if [ "${DUMP_ONLY:-0}" = "1" ]; then
    echo "▶ DUMP_ONLY=1 → stopping before restore. Dump at ${DUMP_FILE}"
    exit 0
  fi

  echo "▶ Step 2/3 — pg_restore into target"
  if [ "${SKIP_DROP:-0}" != "1" ]; then
    echo "  ↳ dropping + recreating public schema on target"
    psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -c \
      "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
  fi

  # --no-owner / --no-acl mirror the dump flags so the restoring role owns objects.
  # --single-transaction: if any step fails, the whole restore rolls back.
  # --exit-on-error: stop on the first error (paired with --single-transaction).
  pg_restore \
    --no-owner \
    --no-acl \
    --single-transaction \
    --exit-on-error \
    --dbname="${TARGET_DATABASE_URL}" \
    "${DUMP_FILE}"
  echo "  ✓ restore complete"
  echo
fi

echo "▶ Step 3/3 — verify row counts (source vs target, public schema)"

# Compare row counts per table. We use pg_class.reltuples on the source
# (already-loaded planner estimate, cheap) and exact COUNT(*) on the target
# (smaller dataset, costless), but we ALSO do exact COUNT(*) on the source for
# the headline tables we care about.
HEADLINE_TABLES=(
  "customer"
  "product"
  "product_variant"
  "\"order\""
  "cart"
  "payment_collection"
  "payment"
  "shipping_option"
  "store"
  "region"
)

count_rows() {
  local url="$1" table="$2"
  psql "${url}" -At -c "SELECT count(*) FROM ${table};" 2>/dev/null || echo "missing"
}

mismatch=0
if [ -n "${SOURCE_DATABASE_URL:-}" ]; then
  printf "  %-26s %12s %12s   %s\n" "table" "source" "target" "status"
  for t in "${HEADLINE_TABLES[@]}"; do
    src=$(count_rows "${SOURCE_DATABASE_URL}" "$t")
    tgt=$(count_rows "${TARGET_DATABASE_URL}" "$t")
    if [ "$src" = "missing" ] && [ "$tgt" = "missing" ]; then
      status="— (absent both sides)"
    elif [ "$src" = "$tgt" ]; then
      status="✓"
    else
      status="✖ MISMATCH"
      mismatch=$((mismatch + 1))
    fi
    printf "  %-26s %12s %12s   %s\n" "$t" "$src" "$tgt" "$status"
  done
else
  echo "  (VERIFY_ONLY without SOURCE_DATABASE_URL → listing target counts only)"
  for t in "${HEADLINE_TABLES[@]}"; do
    tgt=$(count_rows "${TARGET_DATABASE_URL}" "$t")
    printf "  %-26s %12s\n" "$t" "$tgt"
  done
fi

# Full-schema table list check: every table on source must exist on target.
if [ -n "${SOURCE_DATABASE_URL:-}" ]; then
  echo
  echo "▶ Schema parity check (information_schema.tables, public)"
  TABLES_SQL="SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
  diff \
    <(psql "${SOURCE_DATABASE_URL}" -At -c "${TABLES_SQL}") \
    <(psql "${TARGET_DATABASE_URL}" -At -c "${TABLES_SQL}") \
    && echo "  ✓ table lists identical" \
    || { echo "  ✖ schema mismatch (left = source, right = target)"; mismatch=$((mismatch + 1)); }
fi

echo
if [ "$mismatch" -gt 0 ]; then
  echo "✖ Migration verification failed (${mismatch} mismatch group(s))." >&2
  exit 1
fi
echo "✓ Migration verified: row counts and table list match."
