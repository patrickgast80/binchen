# Runbook

Operator playbooks for production alarms and cutover procedures. Each entry
answers: **what alerted, what to check next, how to fix, when to escalate.**

---

## TLS-Alarm (BIL-2393)

**Alert source:** GitHub Actions workflow `TLS Monitor (bilulu.de prod domains)`
runs daily at 06:15 UTC and on manual dispatch. On failure it:

1. Fails the workflow (repo watchers get a GitHub email).
2. Opens (or comments on) a GitHub issue labelled `tls-alarm` / `bil-2393`.

**What it checks per domain (bilulu.de, www.bilulu.de, api.bilulu.de):**

- Cert issuer contains `Let's Encrypt` (guards against Traefik default cert — the
  BIL-2392 regression pattern).
- Cert has more than 14 days remaining (LE certs renew at 30 days, so <14 days
  means renewal is stuck).
- `curl -sS -w '%{ssl_verify_result}'` returns `0` against the system CA store
  (rules out chain-mismatch bugs that openssl might tolerate).

### Playbook: TLS-Alarm fired

1. **Verify the alarm is real** — the check might have raced with an LE renewal:
   ```
   for d in bilulu.de www.bilulu.de api.bilulu.de; do
     echo "=== $d ==="
     echo | openssl s_client -connect "$d:443" -servername "$d" 2>/dev/null \
       | openssl x509 -noout -issuer -subject -dates
   done
   ```
   Expect `issuer=C=US, O=Let's Encrypt, CN=YR1` (or YR2) and a `notAfter` at
   least two weeks in the future.

2. **If the issuer shows `TRAEFIK DEFAULT CERT`** → BIL-2392 pattern. Traefik's
   ACME retry-state got stuck. Fix by restarting the proxy on the Coolify host
   (see [`COOLIFY_MIGRATION.md`](./COOLIFY_MIGRATION.md) for host access):

   ```
   # Back up acme.json first — LE has a 5-failed-authz/hour rate limit and you
   # don't want to lose an already-working cert if the restart triggers a bad request.
   ssh <coolify-host> "sudo cp -a /data/coolify/proxy/acme.json \
     /data/coolify/proxy/acme.json.bak.tls-alarm-$(date -u +%Y%m%dT%H%M%SZ)"

   ssh <coolify-host> "docker restart coolify-proxy"

   # Watch Traefik iterate the routers and hit LE.
   ssh <coolify-host> "docker logs -f coolify-proxy" \
     | grep -E "acme|certificate|http-01"
   ```

   After ~30–60s: re-run the check step above. All three domains should show a
   Let's Encrypt issuer.

3. **If the alarm is different** (e.g. cert < 14 days but still LE-issued, or
   ssl_verify_result != 0 with LE issuer) — open a Paperclip DevOps issue with:
   - The failing openssl output.
   - The GitHub Actions run URL from the alarm issue.
   - Priority `high` (short-window renewal failures compound fast — LE rate
     limits kick in at 5 failed authz per hour per host per account).

4. **Rollback** — if the restart made things worse:
   ```
   ssh <coolify-host> "sudo cp -a /data/coolify/proxy/acme.json.bak.tls-alarm-<timestamp> \
     /data/coolify/proxy/acme.json && sudo docker restart coolify-proxy"
   ```

5. **Close the alarm issue** — comment with the fix + a fresh `openssl s_client`
   verification, then close. If a new run fires the next day the workflow will
   open a fresh issue.

### Playbook: TLS-Alarm never fired but a customer reports a cert warning

Someone is seeing `TRAEFIK DEFAULT CERT` in their browser and the monitor is
still green — check whether they're hitting a different Traefik router (e.g. an
old CNAME still pointing at the proxy for a stale subdomain). Only the three
monitored domains are covered. If a new customer-facing domain needs coverage:

- Edit `.github/workflows/tls-monitor.yml` and add the domain to the default
  `DOMAINS` fallback in `scripts/tls-monitor.sh`.

### Escalation

- Two consecutive daily alarms → escalate to CEO (repeat failure means Traefik
  is not self-healing; may need Coolify version bump or `ssl_email` config).
- LE rate limit hit (`too many failed authorizations`) → wait one hour; do not
  restart the proxy again until then. Rate limit key is per-account, per-host.

---

## Future hardening — Better Stack (parked)

The BIL-2393 spec listed Better Stack as an alternative alarm channel (free tier,
10 monitors, per-domain "HTTPS Monitor" with `Alert on invalid SSL` + cert
expiration monitor). Setup requires a Better Stack account and API integration,
both **CEO actions**. The GitHub-Actions monitor above covers the same checks
and needs no additional accounts, so Better Stack is treated as a hardening
follow-up rather than a launch blocker.

If we adopt Better Stack later:

- Add three HTTPS Monitors, one per domain, with `Alert on invalid SSL` enabled.
- Add three Certificate-Expiration monitors with threshold `14 days`.
- Route alerts to `info@bilulu.de` (and a paging channel once one exists).
- Turn off the GitHub-Actions workflow, or keep it as a second-source cross-check.

---

## Postgres backups (BIL-2405)

**Where they live.** Nightly logical dumps of the `binchen` database land on
the Hetzner host at `/home/deploy/backups/bilulu-postgres/`, one file per run
named `binchen-YYYYMMDDTHHMMSSZ.dump` (pg_dump custom format, `-Fc`). The
directory is on the host filesystem, **outside** the Coolify Postgres
container's volume, so a container wipe does not take backups with it.

**Schedule.** `crontab -l` as user `deploy` runs `/home/deploy/bin/binchen-pg-backup.sh`
at 01:15 UTC daily. Retention is 14 days; older dumps are pruned by the same
script. Success/failure lines append to `/home/deploy/backups/bilulu-postgres/.log`.

**How to verify (weekly sanity check):**
```
ssh deploy@188.245.40.74 'tail -5 /home/deploy/backups/bilulu-postgres/.log
ls -lh /home/deploy/backups/bilulu-postgres/ | head -8'
```
Expect one new `OK` line per day and a fresh `.dump` file each morning.

### Playbook: Restore from backup

Restore into a **scratch database** first -- never straight into `binchen`
without confirmation from the CEO.

```
ssh deploy@188.245.40.74
# 1) pick a dump
LATEST=$(ls -1t /home/deploy/backups/bilulu-postgres/binchen-*.dump | head -1)
echo "$LATEST"

# 2) create scratch db + restore
docker exec rqh57h1ohsowasr6eheqz0dr dropdb -U binchen --if-exists binchen_restore_test
docker exec rqh57h1ohsowasr6eheqz0dr createdb -U binchen binchen_restore_test
cat "$LATEST" | docker exec -i rqh57h1ohsowasr6eheqz0dr \
  pg_restore -U binchen -d binchen_restore_test --no-owner --no-privileges

# 3) sanity-check row counts (top 10 tables by size)
docker exec rqh57h1ohsowasr6eheqz0dr psql -U binchen -d binchen_restore_test \
  -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"

# 4) drop scratch when done
docker exec rqh57h1ohsowasr6eheqz0dr dropdb -U binchen binchen_restore_test
```

**Cutover to prod (only with CEO go-ahead):**
1. Stop the backend container so nothing writes during restore:
   `docker stop k3apwpfen4qlb1hc1jdnli6f` (or whatever `docker ps` shows).
2. `dropdb -U binchen binchen && createdb -U binchen binchen`.
3. `cat "$DUMP" | docker exec -i rqh57h1ohsowasr6eheqz0dr pg_restore -U binchen -d binchen --no-owner --no-privileges`.
4. Start the backend container back up; confirm `/health` returns 200.
5. Post a comment on the incident issue with dump filename + restore duration.

**Restore-test evidence (initial):** 2026-07-19 -- dump
`binchen-20260718T231501Z.dump` (445 KB) restored into scratch db with all
seeded tables intact (`region_country=250`, `currency=123`, 164 migrations).
Repeat this test at least quarterly and before every DR drill.

### Playbook: Backups stopped

Symptoms: `tail /home/deploy/backups/bilulu-postgres/.log` shows a `FAIL`
line, or no new dump for >24h.

1. Reproduce the run manually:
   `ssh deploy@188.245.40.74 /home/deploy/bin/binchen-pg-backup.sh`
2. Common failures:
   - **`container not running`** -> the Postgres UUID changed. Check
     `docker ps | grep postgres`, update `CONTAINER=` in the script.
   - **`No space left on device`** -> `df -h /home` on the host. Prune old
     dumps beyond retention, or bump the disk on the Hetzner box.
   - **`pg_dump: connection refused`** -> Postgres is down. Escalate to
     backend crash triage before touching backups.
3. If the fix is a script change, edit `/home/deploy/bin/binchen-pg-backup.sh`
   in place and commit the same change to `infra/scripts/pg-backup.sh` if we
   add a copy to the repo (currently host-only to avoid drift with the
   Coolify-managed container UUID).
4. Escalate to CEO if backups are down for >48h -- that is the point at which
   a hard failure would exceed the acceptable data-loss window.

---

## Uptime-Alarm (BIL-2405)

**Alert source:** GitHub Actions workflow `Uptime Monitor (bilulu.de + api.bilulu.de)`
runs every 15 minutes and probes:

- `GET https://bilulu.de/` -- expects 200 within 15s (storefront root).
- `GET https://api.bilulu.de/health` -- expects 200 within 15s (Medusa health).

Each probe retries twice with a 3s gap before it counts as a failure, so a
single dropped packet from a GH-Actions runner does not page anyone. On
failure the workflow (1) fails the run so repo watchers get a GitHub email
and (2) opens/updates an issue labelled `uptime-alarm` / `bil-2405`.

### Playbook: Uptime-Alarm fired

1. **Reproduce from any shell:**
   ```
   curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://bilulu.de/
   curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://api.bilulu.de/health
   ```
   Both should print `200`. If they do now, the alarm was a transient blip
   from the runner -- close with a note.

2. **Storefront down, backend up:** the Coolify app `f12ixtdb...` (storefront)
   is the suspect.
   ```
   ssh deploy@188.245.40.74 'docker ps --filter name=f12ixtdb --format "{{.Names}} {{.Status}}"'
   ssh deploy@188.245.40.74 'docker logs --tail 200 <container-name>'
   ```
   Common causes: Next.js build regression, missing env var after redeploy,
   Vercel-style edge cache miss timing out (unlikely on self-host but check).

3. **Backend down, storefront up:** the Coolify app `k3apwpfe...` (backend)
   is the suspect. Same drill. Common causes: Medusa boot failure (check
   `medusa db:migrate` output), Postgres unreachable (check
   `docker ps | grep rqh57`), env-var breakage.

4. **Both down:** Traefik or DNS.
   ```
   ssh deploy@188.245.40.74 'docker ps | grep coolify-proxy'
   dig +short bilulu.de
   dig +short api.bilulu.de
   ```
   If Traefik is missing, `docker start coolify-proxy`. If DNS is wrong,
   Cloudflare dashboard -- CEO action.

5. **Alarm persists after fix:** escalate to CEO with the failing curl
   output, the GitHub Actions run URL, and a link to whichever container's
   logs surfaced the root cause.

### Recommendation vs. external monitors

We keep the GitHub-Actions cron because it is free, needs no external
account, alerts land as GitHub issues that DevOps already handles, and the
same pattern (labelled issue + workflow-run email) is used by the TLS
monitor -- one playbook covers both. If a paged SLA is needed later,
Better Stack's free tier gives 10 monitors and can co-exist alongside this
workflow as a second source (same note as the TLS section above).
