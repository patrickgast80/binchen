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

---

## Auto-Deploy: push auf main → Coolify (BIL-2459)

**Primärpfad:** Host-seitiger Poller auf `deploy@188.245.40.74` (der Coolify-
Host selbst). `crontab -l` als `deploy` läuft alle 5 Minuten:
`/home/deploy/bin/binchen-autodeploy-poll.sh` — vergleicht per anonymem
`git ls-remote` (Repo ist public) den `main`-HEAD mit dem zuletzt getriggerten
SHA (`/home/deploy/.binchen-autodeploy-last`) und POSTet bei Abweichung genau
**einen** Deploy pro App (Storefront + Backend) an die Coolify-API.

**Retry-Semantik (BIL-2517):** max. **zwei** Build-Versuche pro SHA und App —
initialer Deploy plus genau ein automatischer Retry, wenn Coolify den letzten
Build dieses SHAs als `failed` meldet (per
`GET /deployments/applications/{uuid}?take=1` beim nächsten Cron-Tick; deckt
transiente Clone-/Netz-Flakes ab, siehe BIL-2517: einmaliger GitHub-Clone-Fehler
ließ Prod still stale). Scheitert auch der Retry, schreibt der Poller einmalig
`GIVING_UP` ins Log und stoppt für diesen SHA (Board-Zwei-Strike-Regel) — dann
manuell in Coolify untersuchen, nicht blind neu anstoßen. Bereits verbrauchte
Retries stehen in `/home/deploy/.binchen-autodeploy-retried` (`sha uuid` je Zeile).

Kanonische Script-Kopie: `infra/hetzner/binchen-autodeploy-poll.sh`.
Secrets: `/home/deploy/.binchen-autodeploy.env` (600, COOLIFY_PAT + App-UUIDs).
Log: `/home/deploy/binchen-autodeploy.log` (eine Zeile pro Deploy-POST;
`retry`/`GIVING_UP` als 4. Feld markieren die Retry-Pfade).

**GIVING_UP-Alarm (BIL-2518):** Die Telegram-Bridge
(`tools/telegram-bridge/`, Daemon auf der Paperclip-Maschine) prüft alle
10 min per SSH (`grep GIVING_UP` auf dem Host-Log) und alarmiert bei neuen
Zeilen aktiv: Telegram an die Allowlist-User + Kommentar auf dem
Default-Issue (BIL-1). Dedupe über `giveupSeen` in
`infra/.vault/telegram-bridge.state.json`; eine Zeile gilt erst als
gesehen, wenn ein Telegram-Send durchging. Bewusst so gebaut, dass der
Bot-Token **nicht** auf den shared Hetzner-Host muss. SSH-Fehler sind nur
ein WARN in `tools/telegram-bridge/bridge.log` (kein Alarm-Spam).
Abschalten/Rollback: `GIVEUP_WATCH=0` in
`infra/.vault/telegram-bridge.env` + Bridge-Neustart (Task
`BinchenTelegramBridge`). Konfig: `GIVEUP_SSH_TARGET`, `GIVEUP_SSH_KEY`
(Default: Vault-Key `coolify-host-ssh.key`), `GIVEUP_INTERVAL_MS`.
Achtung Neustart: den Bridge-`node`-PID killen kann den
Watchdog-`cmd` mitreißen — danach `schtasks /Run /TN
BinchenTelegramBridge` und `bridge up`-Zeile im Log verifizieren.

**Warum kein GitHub-Weg?** Coolifys GitHub-App-Webhook hat auf diesem Repo nie
gefeuert (BIL-2397), und das Actions-Secret `COOLIFY_PAT` wurde nie gesetzt —
`coolify-deploy.yml` hat deshalb monatelang grün geskippt, ohne zu deployen
(Root Cause des Stale-Prod-Vorfalls BIL-2459). Der Workflow bleibt als
Fallback bestehen und wird aktiv, sobald ein CEO das Secret doch setzt.

### Playbook: Prod scheint stale (Route auf main fehlt live)

1. Deployte Version prüfen:
   ```
   ssh deploy@188.245.40.74 'cat /home/deploy/.binchen-autodeploy-last; tail -5 /home/deploy/binchen-autodeploy.log'
   git ls-remote https://github.com/patrickgast80/binchen.git refs/heads/main
   ```
2. SHAs gleich, aber Route fehlt → Build-Problem, Coolify-Deployment-Logs
   ansehen (`https://coolify.bilulu.de`, Apps `f12ixtdb…`/`k3apwpfe…`).
3. SHAs verschieden und Log ohne neue Zeile → Cron/Poller prüfen:
   ```
   ssh deploy@188.245.40.74 'crontab -l | grep autodeploy; tail /home/deploy/binchen-autodeploy.cron.log'
   ```
4. Manueller Fallback (PAT aus `infra/.vault/coolify-pat.env`):
   ```
   curl -X POST -H "Authorization: Bearer $COOLIFY_PAT" \
     "https://coolify.bilulu.de/api/v1/deploy?uuid=<app-uuid>&force=false"
   ```

**Rollback des Pollers:**
`ssh deploy@188.245.40.74 'crontab -l | grep -v binchen-autodeploy-poll | crontab -'`

### Playbook: Deploy-Queue blockiert (Zombie-Deployment auf in_progress) — BIL-2503

**Symptom:** Deploys stauen sich in `queued`, ein Deployment steht dauerhaft auf
`in_progress`, obwohl sein Build-Container weg ist ("Gracefully shutting down
build container" in den Logs, danach nichts mehr).

**Häufigste Ursache: Platte voll.** Der Build-Container stirbt (z.B.
`No space left on device`), aber Coolify markiert den Queue-Datensatz nie als
beendet — er blockiert die Concurrency und damit alle folgenden Deploys.

1. Queue-Zustand ansehen (PAT aus `infra/.vault/coolify-pat.env`):
   ```
   curl -s -H "Authorization: Bearer $COOLIFY_PAT" "$COOLIFY_API_BASE/deployments"
   ```
   Beim vermeintlich laufenden Deployment die letzten Log-Timestamps prüfen —
   Minuten alt + "shutting down build container" ⇒ Zombie.
2. SSH auf den Host. Kein lokaler Key nötig: `GET $COOLIFY_API_BASE/security/keys`
   liefert den Private Key (`deploy@188.245.40.74`); nach
   `infra/.vault/coolify-host-ssh.key` schreiben, `chmod 600`.
3. Platte prüfen und freiräumen (Prod-Container bleiben unberührt):
   ```
   df -h /; sudo docker system df
   sudo docker builder prune -af
   sudo docker image prune -af    # entfernt auch alte Rollback-Images → Rollback = Rebuild aus Git
   ```
4. Zombie-Datensätze beenden und Duplikate stornieren (Coolify-DB):
   ```
   sudo docker exec coolify-db psql -U coolify -d coolify -c \
     "UPDATE application_deployment_queues SET status='failed', finished_at=now() \
      WHERE deployment_uuid IN ('<uuid>') AND status='in_progress';"
   sudo docker exec coolify-db psql -U coolify -d coolify -c \
     "UPDATE application_deployment_queues SET status='cancelled-by-user', finished_at=now() \
      WHERE status='queued';"
   ```
   (Alle `queued` stornieren ist ok — der nächste Schritt postet frische Deploys;
   der Poller triggert bei neuen Pushes ohnehin nach.)
5. Horizon prüfen: `sudo docker exec coolify php artisan horizon:status` →
   "Horizon is running." Wenn nicht: `sudo docker restart coolify` (Coolify räumt
   beim Boot hängende Deployments selbst auf).
6. Je App **einen** frischen Deploy posten (RUNBOOK §Auto-Deploy Schritt 4).
   Der frische POST dispatcht sofort; die stornierten Duplikate braucht niemand.

**Prävention (seit 2026-08-18):** Coolifys Docker-Cleanup läuft stündlich statt
täglich (`server_settings.docker_cleanup_frequency='0 * * * *'`, server_id=0).
Rollback: Wert zurück auf `'0 0 * * *'` setzen. Die 38-GB-Platte verkraftet
sonst keinen Tag mit 5+ Storefront-Builds (je ~2-4 GB Image + Build-Cache).

## Health-gated Deploy-Cutover (BIL-2511)

**Warum:** Ohne Container-Healthcheck erklärt Coolify (4.1.2) den frisch
gestarteten Container **sofort** für gesund (`health_check()` returnt bei
`isHealthcheckDisabled() && !custom_healthcheck_found` direkt mit
`newVersionIsHealthy = true`) und stoppt den alten — beim Medusa-Backend
bedeutete das ~45 s 502 pro Deploy (Migrationen + Seeds laufen vor
`medusa start`). Gemessen in BIL-2507/2511: 44 s Ausfall, 28/28
Warenkorb-Klicks im Fenster gescheitert.

**Mechanik:** Beide Dockerfiles (`apps/storefront/Dockerfile`,
`apps/backend/Dockerfile`) tragen ein `HEALTHCHECK` auf Basis von
`node -e "require('http').get(…)"` (kein curl/wget im Image nötig).
Coolify parst die `--interval/--timeout/--start-period/--retries`-Flags bei
**jedem Deploy** aus dem Dockerfile in seine eigene Wait-Loop
(`parseHealthcheckFromDockerfile`, sichtbar als `custom_healthcheck_found`
am `GET /applications/{uuid}`). Ablauf pro Deploy: neuen Container starten →
auf Docker-`healthy` warten → alten Container graceful stoppen (erst dann
fliegt er aus Traefik). Wird der neue Container nie gesund: Deploy failt,
**der alte Container serviert weiter** (eingebautes Rollback).

Backend-Werte: `--interval=5s --timeout=5s --start-period=30s --retries=30`
→ Boot-Toleranz ≈ 30 s + 30×5 s = 180 s. Medusa-Boot liegt bei ~45–60 s
(db:migrate + 5 Seed-Skripte + Start). `/health` antwortet erst, wenn der
HTTP-Server lauscht, also erst nach allen Boot-Schritten — 200 ⇒ wirklich bereit.

**Nicht in Coolify-UI nachziehen:** `health_check_enabled` bleibt `false` —
das Dockerfile ist die Single Source of Truth. Coolifys eigener
(curl-basierter) Healthcheck würde in `node:alpine` fehlschlagen.

**Check nach Dockerfile-Änderungen am HEALTHCHECK:**
```
curl -s -H "Authorization: Bearer $COOLIFY_PAT" \
  "$COOLIFY_API_BASE/applications/$COOLIFY_BACKEND_UUID" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('custom_healthcheck_found:',j.custom_healthcheck_found,'retries:',j.health_check_retries)})"
ssh deploy@188.245.40.74 'sudo docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "f12ixtdb|k3apwpfe"'
# beide Container müssen "(healthy)" zeigen
```
Cutover live vermessen (1,5-s-Proben gegen bilulu.de + api.bilulu.de):
`node apps/backend/scripts/bil2507/watch-cutover.mjs --minutes 14`.

**Bekannter Rest (by design):** Während des Rolling Updates servieren alter
und neuer Container ~10–15 s parallel (Storefront-ETag wechselt hin und her).
Für die API harmlos; im Storefront kann ein Asset-Request mit Build-ID des
einen Containers beim anderen landen (404 auf `/_next/static/<buildid>/…`),
heilt sich nach dem Fenster selbst. Erst angehen (Sticky-Sessions via
Traefik-Label), falls QA es je als echtes Problem sieht.

**Rollback:** `git revert 091246b` (Backend-HEALTHCHECK raus) → nächstes
Deploy fällt auf Sofort-Cutover zurück; Coolify setzt
`custom_healthcheck_found` beim nächsten Deploy selbst zurück, wenn kein
`HEALTHCHECK` mehr im Dockerfile steht.

## Telegram-Bridge (BIL-2481)

Lokaler Long-Polling-Daemon auf der **Windows-Maschine** (nicht Hetzner!),
verbindet Telegram-Bot mit der lokalen Paperclip-API (127.0.0.1:3100).
Vollständige Doku: `tools/telegram-bridge/README.md`.

**Bridge antwortet nicht:**
1. Läuft der Prozess? `tasklist | findstr node` bzw. `bridge.log` prüfen
   (`tools/telegram-bridge/bridge.log`).
2. Log sagt 401 → Paperclip-Key in `infra/.vault/telegram-bridge.env` abgelaufen;
   neuen Key eintragen (Board: Agents → DevOps → API keys), Bridge liest die Datei
   beim nächsten Request selbst neu.
3. Log sagt Telegram 409 → zweite Bridge-Instanz läuft; eine beenden.

**Start/Stop:** `tools\telegram-bridge\start-bridge.cmd` bzw. Task
`BinchenTelegramBridge` (schtasks). Rollback = Prozess stoppen; die Bridge ist
rein additiv (nur Kommentare/Issues/Attachments).

**Secrets:** `infra/.vault/telegram-bridge.env` (gitignored) — Bot-Token
(@BotFather, Revoke via `/revoke`) + Paperclip Agent-API-Key `telegram-bridge`
(Scope task_bridge, Projekt-beschränkt; Board kann ihn jederzeit löschen).

---

## PayPal Live-Cutover (BIL-2482)

> **Stand 2026-08-19 (BIL-2525, Board-Entscheidung B):** Der PayPal-Button ist
> **ausgeblendet**. `NEXT_PUBLIC_PAYPAL_CLIENT_ID` wurde in Coolify
> (Storefront-App `f12ixtdb`, prod- **und** preview-Env) gelöscht; leere
> Client-ID ⇒ `paypalReady=false` in
> `apps/storefront/src/app/checkout/payment/page.tsx` ⇒ kein SDK-Tag, kein
> Button. Vorkasse ist unberührt. Backend-Env (`PAYPAL_*`) ist absichtlich
> **nicht** angefasst.
>
> **Reaktivierung (Sandbox-Stand):** Wert steht in
> `infra/.vault/paypal-sandbox.env` → `NEXT_PUBLIC_PAYPAL_CLIENT_ID`. In
> Coolify als Env der Storefront-App wieder anlegen (nur diese eine Variable —
> über build-time.env haben wir uns schon einmal `NODE_ENV=production` und
> damit einen kaputten Build eingefangen; nichts anderes ändern), Redeploy
> (echter Rebuild nötig,
> `NEXT_PUBLIC_*` wird zur Build-Zeit inlined), dann
> `node apps/e2e/scripts/bil2525-paypal-hidden.mjs --expect-present` (echter
> Cart, misst SDK-Tag + Button). **Für Live statt Sandbox:** Playbook unten.

Der PayPal-Button war seit 2026-08-14 im Shop sichtbar, lief aber mit
**Sandbox**-Credentials. Eine echte Kundin landet im Sandbox-Login und kommt nicht
durch; Vorkasse/Überweisung daneben ist unberührt und grün. PayPal-Event-Log:
0 Events — es hat real noch nie jemand bezahlt.

**Kein Code-Change nötig.** Modus, Host und Webhook-Signaturprüfung hängen
ausschließlich an Env (`medusa-config.ts:49-59` → `client.ts:42-45`):
`PAYPAL_MODE=live` schaltet auf `https://api-m.paypal.com`, `PAYPAL_WEBHOOK_ID`
ist die einzige Quelle für die Signaturprüfung. Ist die Webhook-ID leer, werden
**alle** Events verworfen (`client.ts` `verifyWebhookSignature` → `false`) —
d.h. eine vergessene Live-Webhook-ID fällt sofort und leise-sicher auf, nicht
still-vertrauend.

### Playbook: Sandbox → Live

Voraussetzung: Board legt unter developer.paypal.com im **Live**-Tab eine App an
und liefert Live-Client-ID, Live-Secret und Live-Webhook-ID.

1. **Webhook zuerst** bei PayPal registrieren (Live-App → Webhooks → Add):
   URL `https://api.bilulu.de/hooks/payment/paypal`, Events
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`.
   Die resultierende Webhook-ID ist `PAYPAL_WEBHOOK_ID`.
2. **Vault**: Werte nach `infra/.vault/paypal-live.env` (gitignored, gleiche Keys
   wie `paypal-sandbox.env`). Sandbox-Datei **nicht** überschreiben — sie ist der
   Rollback-Stand und die Grundlage der Integrationstests.
3. **Coolify-Env** (DevOps), 5 Variablen, beide Apps:
   | App | Variable | Wert |
   |---|---|---|
   | backend | `PAYPAL_CLIENT_ID` | Live-Client-ID |
   | backend | `PAYPAL_CLIENT_SECRET` | Live-Secret |
   | backend | `PAYPAL_WEBHOOK_ID` | Live-Webhook-ID aus Schritt 1 |
   | backend | `PAYPAL_MODE` | `live` |
   | storefront | `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Live-Client-ID (dieselbe wie backend) |
   `NEXT_PUBLIC_*` wird zur **Build**-Zeit inlined → Storefront braucht einen
   echten Rebuild, ein Container-Restart genügt nicht.
4. **Redeploy** backend + storefront.
5. **Verifizieren** (Reihenfolge zählt):
   - `PAYPAL_MODE`/Host: Backend-Log beim Boot bzw. `pnpm --filter @binchen/backend test:paypal:sandbox`
     verweigert bewusst den Dienst, wenn `PAYPAL_MODE != sandbox` — das ist die
     Absicherung dagegen, dass ein Testskript versehentlich echte Orders anlegt.
   - Storefront: SDK-Tag auf `/checkout/payment` (**mit** befülltem Warenkorb —
     ohne Cart redirected die Route auf `/cart`, dann ist gar kein Tag da) muss die
     **Live**-Client-ID tragen, nicht mehr die aus `paypal-sandbox.env`.
   - Signaturprüfung: erst der erste echte Event beweist sie. Ein Event mit
     falscher/alter Webhook-ID wird verworfen und loggt
     `[payment-paypal] dropped unverified webhook event_type=…` — dieses Log ist
     das Alarmsignal für „Webhook-ID passt nicht zur App".
6. **Einmal-Verifikation mit echtem Geld** (Inhaberin, Kleinstbetrag): Bestellung
   → Approve → im PayPal-Konto Refund. Deckt genau die drei Pfade ab, die im
   Sandbox nie liefen (Approve/Capture/Refund). Erwartet: Order wird bezahlt,
   `PAYMENT.CAPTURE.COMPLETED` korreliert auf die Payment-Session (s.u.), Refund
   kommt an.

### Webhook-Korrelation (Grund, warum Schritt 6 vorher nie funktioniert hätte)

PayPal spiegelt `purchase_unit.reference_id` **nicht** in die Capture-/Refund-
Ressource. Nur `custom_id`/`invoice_id` überleben in das Event. Bis BIL-2482 setzte
`createOrder` kein `custom_id` → jeder Capture-Webhook wäre mit leerer
`session_id` bei Medusa angekommen. Seither trägt `custom_id` die Medusa-
Payment-Session-ID; als Fallback für Orders aus der Rollout-Lücke wird über
`supplementary_data.related_ids.order_id` die Order nachgeladen und `custom_id`
von dort gelesen. Findet sich keine Session, wird der Event mit
`[payment-paypal] no session id on webhook …` geloggt und als `NOT_SUPPORTED`
quittiert — 200 an PayPal (kein Retry-Sturm bei At-least-once-Zustellung), aber
keine stille Falsch-Mutation.

### Capture: „approved" ist nicht „bezahlt"

Unsere Orders laufen mit `intent=CAPTURE`. PayPal hält für uns also **keine**
Autorisierung vor: eine `APPROVED`-Order ist genau ein POST vom Geldfluss
entfernt, und eine Zustimmung, die niemand captured, verfällt einfach. Bis
BIL-2482 machte diesen POST **niemand** — `service.ts` nahm an, das Storefront
capture beim `onApprove` über eine Server-Route, aber `/api/checkout/complete`
schliesst nur den Warenkorb ab. Im Sandbox-Durchlauf nachgemessen: Kundin
approved, Medusa legt die Bestellung an, PayPal meldet weiter `captures: []`.
Live wäre das: Kundin zahlt, sieht die Bestätigungsseite, Bestellung liegt im
Shop — und es kommt nie Geld an.

Seither captured `authorizePayment` selbst, sobald PayPal `APPROVED` meldet, und
gibt `CAPTURED` zurück (vom Payment-Modul ausdrücklich vorgesehen: es normalisiert
auf `AUTHORIZED`, schreibt die Capture und ruft den Provider **nicht** erneut).
Idempotenz: die PayPal-Order-ID ist zugleich `PayPal-Request-Id`, ein Replay kann
also nicht doppelt abbuchen; `ORDER_ALREADY_CAPTURED` gilt als verlorenes Rennen,
nicht als Fehler. `INSTRUMENT_DECLINED` → `REQUIRES_MORE` (Kundin wählt eine
andere Zahlungsquelle), alles andere wirft → Cart-Completion schlägt fehl, statt
eine unbezahlte Bestellung anzulegen.

Tests: `pnpm --filter @binchen/backend test:paypal` (offline, 29 Checks) und
`test:paypal:sandbox` (echte Sandbox-Order: PayPal akzeptiert + spiegelt
`custom_id`, Replay derselben `PayPal-Request-Id` liefert dieselbe Order-ID).
Ganze Kette gegen Prod: `node apps/e2e/scripts/bil2482-sandbox-capture.mjs`
(Cart → Session → Approve → Capture → Webhook → Refund).

**Sandbox-Buyer-Login gibt es nicht** — die beiden Slots in
`paypal-sandbox.env` sind leer, deshalb endeten alle früheren E2E-Versuche am
Approve-Link. Das Skript approved daher serverseitig per
`confirm-payment-source` mit einer Test-Karte; das ist derselbe Zustandsübergang
wie der Klick der Kundin und braucht keinen Account.

### Rollback

Umgekehrt zu Schritt 3: die 4 Backend-Variablen zurück auf die Werte aus
`infra/.vault/paypal-sandbox.env`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` auf die
Sandbox-ID — beide Apps redeployen. Kein Code-Revert, keine Migration.

**Sofort-Mitigation ohne Live-Creds** (Variante B): im Storefront
`NEXT_PUBLIC_PAYPAL_CLIENT_ID` **leeren** + Rebuild. Der Code fällt sauber auf
„nur Vorkasse" zurück (`apps/storefront/src/app/checkout/payment/page.tsx:38`
`paypalReady = Boolean(PAYPAL_CLIENT_ID)`). Eine Variable, sofort reversibel,
kein Backend-Deploy.
