#!/usr/bin/env bash
# Uptime-Monitor -- BIL-2405
# Verifies each launch-critical URL returns the expected HTTP status inside a
# reasonable time budget. Exits non-zero on any failure so the calling CI job
# fails loudly and the workflow can open a GitHub-issue alarm (BIL-2393 pattern).
#
# Usage:
#   ./scripts/uptime-monitor.sh                    # defaults from PROBES below
#   PROBES="https://bilulu.de|200 https://api.bilulu.de/health|200" \
#     ./scripts/uptime-monitor.sh
#
# Format: whitespace-separated tokens of "URL|EXPECTED_STATUS".
# TIMEOUT_SEC bounds a single request; MIN_RETRIES retries transient failures
# (network hiccups from a GH-Actions runner shouldn't page anyone).

set -uo pipefail

DEFAULT_PROBES="https://bilulu.de|200 https://api.bilulu.de/health|200"
PROBES="${PROBES:-$DEFAULT_PROBES}"
TIMEOUT_SEC="${TIMEOUT_SEC:-15}"
MIN_RETRIES="${MIN_RETRIES:-2}"

fail_count=0
NL=$'\n'
report=""

append_fail() {
  report="${report}${1}${NL}"
}

check_one() {
  local url="$1"
  local expected="$2"
  local attempt=1
  local last_status=""
  local last_time=""

  while [ "$attempt" -le "$MIN_RETRIES" ]; do
    # -w emits "status\ttotal_time" so we don't need jq; -o /dev/null drops body.
    read -r last_status last_time < <(
      curl -sS -o /dev/null --max-time "$TIMEOUT_SEC" \
        -w '%{http_code}\t%{time_total}\n' \
        "$url" 2>/dev/null || echo "000	0"
    )
    if [ "$last_status" = "$expected" ]; then
      printf 'PASS  %-40s -> %s in %ss (attempt %d)\n' "$url" "$last_status" "$last_time" "$attempt"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 3
  done

  printf 'FAIL  %-40s -> %s (expected %s) after %d attempts\n' \
    "$url" "$last_status" "$expected" "$MIN_RETRIES"
  append_fail "$url -> $last_status (expected $expected) after $MIN_RETRIES attempts"
  return 1
}

for token in $PROBES; do
  url="${token%%|*}"
  expected="${token##*|}"
  if [ -z "$url" ] || [ -z "$expected" ] || [ "$url" = "$expected" ]; then
    echo "SKIP  malformed probe token: '$token' (expected 'URL|STATUS')"
    continue
  fi
  check_one "$url" "$expected" || fail_count=$((fail_count + 1))
done

echo
echo "=== SUMMARY ==="
if [ "$fail_count" -eq 0 ]; then
  echo "All uptime probes OK."
  exit 0
fi

echo "$fail_count probe(s) failed:"
printf '%s' "$report"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "failed=1"
    echo "report<<UPTIME_REPORT_EOF"
    printf '%s' "$report"
    echo "UPTIME_REPORT_EOF"
  } >>"$GITHUB_OUTPUT"
fi
exit 1
