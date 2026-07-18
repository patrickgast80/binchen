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
