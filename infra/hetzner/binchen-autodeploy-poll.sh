#!/usr/bin/env bash
# BIL-2459: host-side auto-deploy poller.
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
# Log:           /home/deploy/binchen-autodeploy.log
#
# Exactly ONE deploy attempt per commit sha — no retry loop (board two-strike
# rule). If a build fails, the next push gets a fresh attempt; investigate
# failures in Coolify, do not re-run blindly.
#
# Rollback: crontab -l | grep -v binchen-autodeploy-poll | crontab -
set -euo pipefail

ENV_FILE=/home/deploy/.binchen-autodeploy.env
STATE=/home/deploy/.binchen-autodeploy-last
LOG=/home/deploy/binchen-autodeploy.log
REPO_URL=https://github.com/patrickgast80/binchen.git

. "$ENV_FILE"

REMOTE=$(git ls-remote "$REPO_URL" refs/heads/main | cut -f1)
[ -n "$REMOTE" ] || exit 0
LAST=$(cat "$STATE" 2>/dev/null || echo none)
[ "$REMOTE" = "$LAST" ] && exit 0

echo "$REMOTE" > "$STATE"
ts=$(date -u +%FT%TZ)
for uuid in "$COOLIFY_STOREFRONT_UUID" "$COOLIFY_BACKEND_UUID"; do
  resp=$(curl -sf -X POST -H "Authorization: Bearer $COOLIFY_PAT" \
    "https://coolify.bilulu.de/api/v1/deploy?uuid=${uuid}&force=false" || echo CURL_FAIL)
  echo "$ts $REMOTE $uuid $resp" >> "$LOG"
done
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
