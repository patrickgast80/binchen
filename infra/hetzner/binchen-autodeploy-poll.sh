#!/usr/bin/env bash
# BIL-2459: host-side auto-deploy poller.  BIL-2517: retry-once on failed build.
#
# Coolify's GitHub App webhook never fired on this repo (BIL-2397) and the
# COOLIFY_PAT GitHub Actions secret was never set, so push-triggered deploys
# silently did nothing and prod went stale. This poller runs on the Coolify
# host itself (deploy@bilulu-prod-01) and needs no GitHub credentials — the
# repo is public, so `git ls-remote` works anonymously.
#
# Installed at:  /home/deploy/bin/binchen-autodeploy-poll.sh
# Cron:          */5 * * * *  (deploy user crontab)
# Secrets:       /home/deploy/.binchen-autodeploy.env (chmod 600) with
#                COOLIFY_PAT, COOLIFY_STOREFRONT_UUID, COOLIFY_BACKEND_UUID
# State:         /home/deploy/.binchen-autodeploy-last (last triggered sha)
#                /home/deploy/.binchen-autodeploy-retried (sha+app pairs that
#                already got their one retry)
# Log:           /home/deploy/binchen-autodeploy.log
#
# Attempt policy (board two-strike rule): max TWO build attempts per commit
# sha per app — the initial deploy, plus exactly one retry if Coolify reports
# that build as failed (covers transient clone/network flakes, see BIL-2517
# where a GitHub clone flake left prod silently stale). A second failure logs
# a single GIVING_UP line and stops; investigate in Coolify, do not re-run
# blindly.
#
# Rollback: crontab -l | grep -v binchen-autodeploy-poll | crontab -
set -euo pipefail

ENV_FILE=/home/deploy/.binchen-autodeploy.env
STATE=/home/deploy/.binchen-autodeploy-last
RETRIED=/home/deploy/.binchen-autodeploy-retried
LOG=/home/deploy/binchen-autodeploy.log
REPO_URL=https://github.com/patrickgast80/binchen.git
API=https://coolify.bilulu.de/api/v1

. "$ENV_FILE"

REMOTE=$(git ls-remote "$REPO_URL" refs/heads/main | cut -f1)
[ -n "$REMOTE" ] || exit 0
LAST=$(cat "$STATE" 2>/dev/null || echo none)

ts=$(date -u +%FT%TZ)

trigger() { # $1=app uuid, $2=tag (deploy|retry)
  resp=$(curl -sf -X POST -H "Authorization: Bearer $COOLIFY_PAT" \
    "$API/deploy?uuid=${1}&force=false" || echo CURL_FAIL)
  echo "$ts $REMOTE $1 $2 $resp" >> "$LOG"
}

if [ "$REMOTE" != "$LAST" ]; then
  echo "$REMOTE" > "$STATE"
  for uuid in "$COOLIFY_STOREFRONT_UUID" "$COOLIFY_BACKEND_UUID"; do
    trigger "$uuid" deploy
  done
else
  # HEAD unchanged. If the newest deployment of an app failed on this exact
  # sha, fire the one allowed retry; if that one failed too, log GIVING_UP
  # once and leave it for a human/agent.
  for uuid in "$COOLIFY_STOREFRONT_UUID" "$COOLIFY_BACKEND_UUID"; do
    latest=$(curl -sf -H "Authorization: Bearer $COOLIFY_PAT" \
      "$API/deployments/applications/${uuid}?take=1" || true)
    [ -n "$latest" ] || continue
    status=$(printf '%s' "$latest" | jq -r '.deployments[0].status // empty')
    commit=$(printf '%s' "$latest" | jq -r '.deployments[0].commit // empty')
    [ "$status" = "failed" ] && [ "$commit" = "$REMOTE" ] || continue
    if grep -q "^$REMOTE $uuid$" "$RETRIED" 2>/dev/null; then
      grep -q "GIVING_UP" <(grep "$REMOTE $uuid" "$LOG" || true) || \
        echo "$ts $REMOTE $uuid GIVING_UP both attempts failed — two-strike reached, investigate in Coolify" >> "$LOG"
      continue
    fi
    echo "$REMOTE $uuid" >> "$RETRIED"
    trigger "$uuid" retry
  done
fi
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
if [ -f "$RETRIED" ]; then tail -n 50 "$RETRIED" > "$RETRIED.tmp" && mv "$RETRIED.tmp" "$RETRIED"; fi
