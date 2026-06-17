# BIL-1545 — Render → Coolify Cutover Playbook

The Medusa backend is being moved off Render's free tier (cold-start spindown,
90-day Postgres cap) onto a Coolify-managed Hetzner box. This doc is the
ground truth for what needs to be in the Coolify environment before cutover.

## Coolify service settings

| Setting          | Value                                                    |
|------------------|----------------------------------------------------------|
| Build Pack       | Dockerfile                                               |
| Repository       | `github.com/patrickgast80/binchen` (branch: `main`)      |
| Build context    | `.` (repo root — workspace manifests live there)         |
| Dockerfile path  | `apps/backend/Dockerfile`                                |
| Exposed port     | `9000`                                                   |
| Healthcheck path | `/health` (HTTP 200 — same probe Render uses)            |
| Resources        | ≥ 1 vCPU, ≥ 1 GB RAM (Medusa build needs the headroom)   |

The Dockerfile already builds Medusa at image-build time and runs
`medusa db:migrate` → `medusa user` → seeds → `medusa start` on container
start. All steps are idempotent — Coolify-style redeploys won't double-seed.

## Env vars to copy from Render

Pull these from Render dashboard → `binchen-backend` → Environment. Source of
truth for descriptions: `render.yaml` + `infra/SECRETS.md`.

### 1. Always required (set before first deploy)

| Var                 | Source                | Notes                                              |
|---------------------|-----------------------|----------------------------------------------------|
| `DATABASE_URL`      | Hetzner Postgres      | New URL after `scripts/migrate-from-render.sh`     |
| `NODE_ENV`          | literal `production`  | Same on Render                                     |
| `JWT_SECRET`        | Render → copy verbatim | Re-using means existing sessions keep working      |
| `COOKIE_SECRET`     | Render → copy verbatim | Same as above                                      |
| `STORE_CORS`        | `https://bilulu.de`    | Storefront origin                                  |
| `ADMIN_CORS`        | `https://bilulu.de`    | Admin origin (admin UI disabled in image, see config) |
| `AUTH_CORS`         | `https://bilulu.de`    | Auth origin                                        |
| `MEDUSA_BACKEND_URL`| `https://api.bilulu.de` | Coolify-assigned public URL of this service       |

> Re-using `JWT_SECRET`/`COOKIE_SECRET` from Render avoids logging every
> existing admin out on cutover. If they're considered burnt, rotate them in
> the same deploy and accept the re-login.

### 2. PayPal (BIL-124 — sole payment provider)

| Var                     | Source                                       | Notes                                  |
|-------------------------|----------------------------------------------|----------------------------------------|
| `PAYPAL_CLIENT_ID`      | Render (sandbox today, live at go-live)      | Required to register payment module    |
| `PAYPAL_CLIENT_SECRET`  | Render                                       | Pair with client id                    |
| `PAYPAL_WEBHOOK_ID`     | Render                                       | Gates signature verification           |
| `PAYPAL_MODE`           | `sandbox` or `live`                          | Switches PayPal API host               |

After cutover the webhook URL in the PayPal developer dashboard must be
re-pointed from `https://binchen-backend.onrender.com/hooks/payment/paypal`
to the new Coolify URL `https://api.bilulu.de/hooks/payment/paypal`. The
webhook id stays valid; only the receiving URL changes.

### 3. Brevo transactional email (BIL-32)

| Var                  | Source | Notes                                                |
|----------------------|--------|------------------------------------------------------|
| `BREVO_API_KEY`      | Render | Brevo dashboard → SMTP & API → API keys              |
| `BREVO_SENDER_EMAIL` | Render | Must be a verified sender in Brevo                   |
| `BREVO_SENDER_NAME`  | `Bilulu` | Literal                                            |
| `BREVO_ADMIN_EMAIL`  | Render | Sabine's inbox for `Neue Bestellung` notifications   |

If unset, the email module degrades to a logging no-op — the boot stays green
but no emails are sent. Useful for the staging stage of the cutover.

### 4. Admin bootstrap (optional, idempotent)

| Var                       | Source | Notes                                                  |
|---------------------------|--------|--------------------------------------------------------|
| `MEDUSA_ADMIN_EMAIL`      | Render | First admin to seed if no users exist yet              |
| `MEDUSA_ADMIN_PASSWORD`   | Vault  | Generated 2026-06-06 — see `infra/SECRETS.md`          |

The container start CMD calls `medusa user -e $EMAIL -p $PASSWORD || true`,
so setting these on a Coolify env where the user already exists is a no-op.

### 5. Coolify-only additions

| Var                | Value                       | Notes                                       |
|--------------------|-----------------------------|---------------------------------------------|
| `REDIS_URL`        | `redis://redis:6379` (if Coolify Redis service is attached) | Optional; Medusa falls back to an in-memory fake redis with a warning log |

### 6. Sentry (when applicable)

| Var          | Source | Notes                              |
|--------------|--------|------------------------------------|
| `SENTRY_DSN` | Render | Sentry project DSN for backend     |

## Cutover sequence

The Two-Strike Deploy Rule applies: if the first or second Coolify deploy fails,
stop and triage — do not push retry commits in a loop.

1. **Prep.** On the runner, install Postgres 16 client tools
   (`apt-get install postgresql-client-16` or use a `postgres:16-alpine`
   container). Make sure both `SOURCE_DATABASE_URL` (Render external URL) and
   `TARGET_DATABASE_URL` (Hetzner) are reachable.

2. **Coolify env (paused).** Create the service in Coolify with the settings
   above and paste every env var from sections 1–5. **Do not start it yet.**

3. **Freeze writes on Render.** Either scale the Render web service to 0 or
   put the storefront into a maintenance redirect so no new orders/users get
   written between the dump and the cutover.

4. **Dump + restore.**
   ```bash
   export SOURCE_DATABASE_URL='postgres://...render.com/binchen'
   export TARGET_DATABASE_URL='postgres://...hetzner/binchen'
   scripts/migrate-from-render.sh
   ```
   The script verifies row counts on headline tables and full-schema parity.
   Stop and triage on any `✖ MISMATCH`.

5. **Start Coolify service.** Watch the boot logs. Expect:
   - `Running migrations...` → `... already up-to-date.`
   - `medusa user` → either `created` or `already exists` (both fine)
   - seed scripts → `exit early` (since data already populated by restore)
   - `medusa start` → `server listening on 9000`

6. **Smoke test.**
   ```bash
   curl -fsS https://api.bilulu.de/health
   curl -fsS https://api.bilulu.de/store/products | jq '.products | length'
   ```
   Both must return success. The product count must match Render.

7. **Flip DNS + storefront env.** Update `NEXT_PUBLIC_MEDUSA_BACKEND_URL` in
   Vercel and redeploy the storefront. PayPal webhook URL update too
   (see PayPal section above).

8. **Decommission Render.** After 24 h of green metrics, delete the Render
   web service. Keep the Postgres snapshot for 30 days as backup.

## Rollback

If anything fails after step 7:
1. Revert `NEXT_PUBLIC_MEDUSA_BACKEND_URL` in Vercel to the Render URL.
2. Scale Render web service back to 1.
3. PayPal webhook URL back to the Render endpoint.
4. The Hetzner Postgres can stay — it just becomes a stale copy until the
   next attempt.

Any writes that happened on Coolify between cutover and rollback are LOST on
rollback, which is why step 3 freezes writes before the dump.
