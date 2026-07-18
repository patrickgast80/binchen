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

## Postgres backups (BIL-1548)

**Where they run:** on the Hetzner host as user `deploy`, driven by cron.

- Script: `/home/deploy/bin/binchen-pg-backup.sh` (canonical copy in repo at
  `infra/scripts/binchen-pg-backup.sh`).
- Schedule: `15 1 * * *` (deploy-user crontab) — 01:15 UTC ≈ 03:15 CEST / 02:15 CET.
  Chosen fixed-UTC to avoid DST drift.
- Dumps land in `/home/deploy/backups/bilulu-postgres/` as
  `binchen-YYYYMMDDTHHMMSSZ.dump` (pg_dump `-Fc` custom-format).
- Retention 14 days (per BIL-1548 spec) — older dumps deleted by `find -mtime +14`.
- One-line status log per run at `/home/deploy/backups/bilulu-postgres/.log`.

Verify recent runs:
```
ssh deploy@188.245.40.74 'tail -5 /home/deploy/backups/bilulu-postgres/.log'
ssh deploy@188.245.40.74 'ls -la /home/deploy/backups/bilulu-postgres/'
```

### Playbook: restore into an ephemeral container (drill)

```
ssh deploy@188.245.40.74 /home/deploy/bin/binchen-pg-restore-test.sh
```

Script boots a `postgres:16-alpine` in `docker network coolify`, restores the
newest dump, prints per-table row counts, and tears the temp container back
down. **Never touches the production database.** Repo copy:
`infra/scripts/binchen-pg-restore-test.sh`.

### Playbook: restore into production (real incident)

⚠ **Board approval required** — this replaces the live database. Rollback is
recreating from the current dump.

1. Freeze writes: pause the storefront + backend in Coolify.
2. Take a fresh dump of the current (broken) DB first for forensics:
   ```
   ssh deploy@188.245.40.74 /home/deploy/bin/binchen-pg-backup.sh
   ```
3. Drop and recreate the target database in the postgres container:
   ```
   ssh deploy@188.245.40.74 'docker exec rqh57h1ohsowasr6eheqz0dr \
     psql -U binchen -d postgres -c "DROP DATABASE binchen;"
   docker exec rqh57h1ohsowasr6eheqz0dr \
     psql -U binchen -d postgres -c "CREATE DATABASE binchen OWNER binchen;"'
   ```
4. Stream the desired dump into the container:
   ```
   ssh deploy@188.245.40.74 \
     'docker exec -i rqh57h1ohsowasr6eheqz0dr pg_restore -U binchen -d binchen \
        --no-owner --no-privileges --clean --if-exists' \
     < /home/deploy/backups/bilulu-postgres/binchen-<STAMP>.dump
   ```
5. Restart backend + storefront in Coolify. Smoke-test `/health` and `/store/products`.

### Board-side hardening asks (not agent-actionable)

- **Hetzner daily snapshot** on the CX22 (+€0.46/mo): Hetzner Cloud → Server →
  Backups → Enable. No agent has a Hetzner Cloud API token in the vault.
- **Storage Box BX11** (optional off-box copy): if provisioned, extend
  `binchen-pg-backup.sh` with an `sftp` push step and set `RETENTION_DAYS=30`.

---

## Uptime monitor — Uptime Kuma (BIL-1548)

**Where it runs:** Coolify-managed one-click service `binchen-uptime`
(service UUID `a3m1d7wz1mcd0qib30ljq17c`, container
`uptime-kuma-a3m1d7wz1mcd0qib30ljq17c`, image `louislam/uptime-kuma:2`).

**Public URL:** `https://uptime-kuma.188-245-40-74.sslip.io`
(sslip.io magic DNS → 188.245.40.74; Let's Encrypt cert). This is an interim
FQDN; swap to `uptime.bilulu.de` once the DNS A record exists (Strato
board-action) and the Coolify UI can set the service FQDN (public API rejects
the FQDN field, so this must be done in the Coolify web UI).

**Traefik routing:** static Docker labels point at the private sslip.io the
Coolify template hard-codes, which is unreachable. The public route lives in
a separate dynamic file at `/data/coolify/proxy/dynamic/bilulu-uptime.yaml`
(repo copy: `infra/traefik/bilulu-uptime.yaml`). Coolify only regenerates
`coolify.yaml`, so this side-file is stable across Coolify redeploys. If
Coolify ever redeploys the Uptime Kuma service, the container may lose its
`coolify`-network attachment — re-attach with:
```
ssh deploy@188.245.40.74 \
  'docker network connect coolify uptime-kuma-a3m1d7wz1mcd0qib30ljq17c'
```

### First-time setup (remaining after deploy)

Uptime Kuma v2 requires a web-based wizard for DB choice + admin creation and
does not expose a REST setup endpoint. Follow-up in a child issue:

1. Open `https://uptime-kuma.188-245-40-74.sslip.io/` → **SQLite** (default).
2. Create admin (store password in vault as `UPTIME_KUMA_ADMIN_PASSWORD`).
3. Add monitors:
   - `bilulu.de HTTPS 200` — HTTPS, URL `https://bilulu.de`, interval 60s,
     retries 3, "Ignore TLS/SSL error" **OFF**.
   - `api.bilulu.de/health` — HTTPS, URL `https://api.bilulu.de/health`,
     interval 60s, expect body contains `OK`.
   - `bilulu-postgres TCP` — TCP, hostname `rqh57h1ohsowasr6eheqz0dr` (or
     `10.0.1.<pg-ip>`), port `5432`. Only reachable because the container is
     on the `coolify` network.
4. Add notification: **SMTP** with Brevo (host `smtp-relay.brevo.com`,
   port 587, user = Brevo SMTP username, password = Brevo SMTP key,
   from `info@bilulu.de`, to `bestellung@bilulu.de`). Send a test alert.
5. Attach the notification to all three monitors; toggle each monitor down
   once to confirm an email lands.

### Playbook: alert says a monitor is red

1. Reproduce with `curl -I https://bilulu.de`, `curl -I https://api.bilulu.de/health`.
   Response codes match the alert? → real incident, jump to service runbook.
2. Codes green? → Uptime Kuma false positive, check its own logs:
   `docker logs uptime-kuma-a3m1d7wz1mcd0qib30ljq17c --tail 100`.
3. If the Uptime Kuma container itself is down: `docker restart` it. Data
   volume is `a3m1d7wz1mcd0qib30ljq17c_uptime-kuma-data` — do NOT delete on
   restart.

### Rollback / decommission

If Uptime Kuma has to be removed:
```
export COOLIFY_API_BASE=https://coolify.bilulu.de/api/v1
source infra/.vault/coolify-pat.env
curl -X DELETE -H "Authorization: Bearer $COOLIFY_PAT" \
  "$COOLIFY_API_BASE/services/a3m1d7wz1mcd0qib30ljq17c"
ssh deploy@188.245.40.74 'sudo rm /data/coolify/proxy/dynamic/bilulu-uptime.yaml'
```

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
