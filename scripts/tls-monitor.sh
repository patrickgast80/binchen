#!/usr/bin/env bash
# TLS-Monitor — BIL-2393
# Verifies each production domain serves a Let's Encrypt certificate that
# is trusted by the system CA store and valid for more than MIN_DAYS days.
# Exits non-zero on any failure so the calling CI job fails loudly.
#
# Usage:
#   ./scripts/tls-monitor.sh                # uses default DOMAINS
#   DOMAINS="foo.example bar.example" ./scripts/tls-monitor.sh
#   MIN_DAYS=30 EXPECTED_ISSUER="Let's Encrypt" ./scripts/tls-monitor.sh
#
# Related: BIL-2392 (root cause: Traefik served DEFAULT CERT after ACME failure state stuck).

set -uo pipefail

DOMAINS="${DOMAINS:-bilulu.de www.bilulu.de api.bilulu.de}"
MIN_DAYS="${MIN_DAYS:-14}"
# Set default with a conditional — apostrophe inside ${VAR:-Let's Encrypt} confuses bash quoting.
if [ -z "${EXPECTED_ISSUER:-}" ]; then
  EXPECTED_ISSUER="Let's Encrypt"
fi

fail_count=0
NL=$'\n'
report=""

append_fail() {
  report="${report}${1}${NL}"
}

now_epoch=$(date -u +%s)

for domain in $DOMAINS; do
  echo "=== $domain ==="

  cert=$(echo | openssl s_client -connect "$domain:443" -servername "$domain" -showcerts 2>/dev/null \
           | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' \
           | awk '/-----BEGIN/{c++} c==1{print} /-----END/&&c==1{exit}')

  if [ -z "$cert" ]; then
    echo "FAIL: could not retrieve certificate"
    append_fail "$domain: could not retrieve certificate"
    fail_count=$((fail_count + 1))
    continue
  fi

  issuer=$(echo "$cert" | openssl x509 -noout -issuer 2>/dev/null | sed 's/^issuer= *//')
  subject=$(echo "$cert" | openssl x509 -noout -subject 2>/dev/null | sed 's/^subject= *//')
  not_after=$(echo "$cert" | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')

  echo "issuer:    $issuer"
  echo "subject:   $subject"
  echo "notAfter:  $not_after"

  domain_fail=0

  # Issuer check
  if echo "$issuer" | grep -qF "$EXPECTED_ISSUER"; then
    echo "PASS: issuer contains \"$EXPECTED_ISSUER\""
  else
    echo "FAIL: issuer does not contain \"$EXPECTED_ISSUER\""
    append_fail "$domain: issuer=\"$issuer\" -- expected to contain \"$EXPECTED_ISSUER\""
    domain_fail=1
  fi

  # Expiry check: portable date parsing works on GNU coreutils (Ubuntu runners, Git-Bash)
  if not_after_epoch=$(date -u -d "$not_after" +%s 2>/dev/null); then
    days_left=$(( (not_after_epoch - now_epoch) / 86400 ))
    echo "daysLeft:  $days_left"
    if [ "$days_left" -lt "$MIN_DAYS" ]; then
      echo "FAIL: certificate expires in $days_left day(s) - below MIN_DAYS=$MIN_DAYS"
      append_fail "$domain: expires in $days_left days -- below MIN_DAYS=$MIN_DAYS"
      domain_fail=1
    else
      echo "PASS: certificate valid for $days_left more days - above MIN_DAYS=$MIN_DAYS"
    fi
  else
    echo "FAIL: could not parse notAfter date"
    append_fail "$domain: could not parse notAfter=\"$not_after\""
    domain_fail=1
  fi

  # System-trust-store verification via curl (ssl_verify_result must be 0)
  # Note: --fail is deliberately omitted — a 404 is fine (api.bilulu.de root returns 404); we only
  # care about the TLS handshake, which curl signals via exit code 6/60 on failure.
  verify_result=$(curl -sS --max-time 20 -o /dev/null -w '%{ssl_verify_result}\n%{http_code}\n' \
                    "https://$domain/" 2>&1 || true)
  ssl_verify=$(echo "$verify_result" | sed -n '1p')
  http_code=$(echo "$verify_result" | sed -n '2p')
  echo "ssl_verify_result: $ssl_verify | http_code: $http_code"
  if [ "$ssl_verify" = "0" ]; then
    echo "PASS: curl accepts certificate against system trust store"
  else
    echo "FAIL: curl rejected certificate ssl_verify_result=$ssl_verify"
    append_fail "$domain: curl ssl_verify_result=$ssl_verify -- expected 0"
    domain_fail=1
  fi

  if [ "$domain_fail" -ne 0 ]; then
    fail_count=$((fail_count + 1))
  fi

  echo
done

echo "=== SUMMARY ==="
if [ "$fail_count" -eq 0 ]; then
  echo "All domains OK."
  exit 0
else
  echo "$fail_count domain(s) failed TLS checks:"
  printf '%s' "$report"
  # Emit machine-readable failure report for the calling workflow.
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
      echo "failed=1"
      echo "report<<TLS_REPORT_EOF"
      printf '%s' "$report"
      echo "TLS_REPORT_EOF"
    } >>"$GITHUB_OUTPUT"
  fi
  exit 1
fi
