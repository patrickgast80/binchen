# Secrets Inventory & Rotation Plan

> **Rule**: No secrets are committed to the repository. All secrets live in Vercel project environment variables (frontend) or Railway environment variables (backend).

---

## Source of Truth

| App | Secret storage | UI location |
|-----|---------------|-------------|
| `apps/storefront` | Vercel project env | https://vercel.com/binchen/storefront/settings/environment-variables |
| `apps/backend` | Railway environment | https://railway.app/project/[PROJECT_ID]/settings |
| GitHub Actions | GitHub repo secrets | https://github.com/[ORG]/binchen/settings/secrets/actions |

---

## Secrets Inventory

### GitHub Actions Secrets (`Settings > Secrets and variables > Actions`)

| Secret name | Description | Owner | Rotates |
|-------------|-------------|-------|---------|
| `VERCEL_TOKEN` | Vercel API token for deploy | DevOps | Annually or on compromise |
| `VERCEL_ORG_ID` | Vercel org/team ID | DevOps | Rarely |
| `VERCEL_PROJECT_ID` | Vercel project ID (storefront) | DevOps | Rarely |
| `RAILWAY_TOKEN` | Railway API token for backend deploy | DevOps | Annually or on compromise |
| `SENTRY_AUTH_TOKEN` | Sentry release upload token | DevOps | Annually |

### Vercel Environment Variables (`apps/storefront`)

| Variable | Environment | Description |
|----------|------------|-------------|
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | All | URL of deployed Medusa backend |
| `NEXT_PUBLIC_SENTRY_DSN` | All | Sentry DSN for error tracking |
| `MEDUSA_PUBLISHABLE_KEY` | All | Medusa storefront API key (public) |
| `REVALIDATION_SECRET` | Production, Staging | Next.js on-demand revalidation webhook secret |

### Railway Environment Variables (`apps/backend`)

| Variable | Environment | Description |
|----------|------------|-------------|
| `DATABASE_URL` | All | Postgres connection string (Railway managed) |
| `JWT_SECRET` | All | Medusa JWT signing secret (generate: `openssl rand -base64 32`) |
| `COOKIE_SECRET` | All | Medusa cookie secret (generate: `openssl rand -base64 32`) |
| `STRIPE_SECRET_KEY` | Production, Staging | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Production, Staging | Stripe webhook endpoint secret |
| `SENTRY_DSN` | All | Sentry DSN for backend error tracking |
| `STORE_CORS` | All | Allowed CORS origins (storefront URL) |
| `ADMIN_CORS` | All | Allowed CORS origins (admin UI URL) |
| `AUTH_CORS` | All | Allowed CORS origins for auth endpoints |
| `MEDUSA_WORKER_MODE` | Production | `worker` for async jobs (set on worker instance) |

---

## Alert on Rotation Failure

- Each secret rotation is manually triggered via the relevant platform UI.
- After rotation: update GitHub Actions secrets, redeploy, verify healthcheck.
- If a secret leaks: rotate immediately, notify CEO, check audit logs for unauthorized use.
- Rotation reminders tracked as GitHub issues with label `secret-rotation`.

---

## Never-in-Repo List

These must never be committed even in `.env` example files with real values:

- Any `*_SECRET` or `*_TOKEN`
- `DATABASE_URL` with credentials
- Stripe keys
- Sentry auth tokens
- Vercel/Railway API tokens

`.env.example` files may contain placeholder values like `your-secret-here`.

---

## Cloudflare

| Item | Location |
|------|----------|
| API Token (DNS-only, least-privilege) | Vercel project env `CLOUDFLARE_API_TOKEN` |
| Zone ID | Vercel project env `CLOUDFLARE_ZONE_ID` (not secret, but kept with token for convenience) |

Cloudflare WAF rules and DNS are managed via Cloudflare dashboard or Terraform (see `infra/terraform/` when added).
