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

## Deployment approach: GitHub App integrations (no CI tokens)

Vercel and Railway both integrate directly with GitHub via OAuth Apps. Deployments are triggered automatically on push — no `VERCEL_TOKEN` or `RAILWAY_TOKEN` are needed in GitHub Actions. CI workflows only run lint/typecheck/build checks.

- **Vercel GitHub App**: auto-creates preview URLs on every PR, auto-deploys to production on merge to `main`
- **Railway GitHub App**: auto-deploys backend on push to `main` (configured via `apps/backend/railway.toml`)

To add CLI-based deploys later (e.g. for rollback scripts), tokens can be added as GitHub Secrets — but this is optional.

---

## Secrets Inventory

### GitHub Actions Secrets (`Settings > Secrets and variables > Actions`)

None required for auto-deploys. Optional tokens if CLI-based deploy scripts are added later:

| Secret name | Description | Owner | Rotates |
|-------------|-------------|-------|---------|
| `SENTRY_AUTH_TOKEN` | Sentry release upload (source maps) | DevOps | Annually |
| `VERCEL_TOKEN` | Vercel CLI deploys (optional) | DevOps | Annually or on compromise |
| `RAILWAY_TOKEN` | Railway CLI deploys (optional) | DevOps | Annually or on compromise |

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
| `DATABASE_URL` | All | Postgres connection string (Railway managed — auto-injected when Postgres add-on is linked) |
| `JWT_SECRET` | All | Medusa JWT signing secret (generate: `openssl rand -base64 32`) |
| `COOKIE_SECRET` | All | Medusa cookie secret (generate: `openssl rand -base64 32`) |
| `STRIPE_SECRET_KEY` | All | Stripe secret key (`sk_test_…` for sandbox, `sk_live_…` for prod) |
| `STRIPE_WEBHOOK_SECRET` | All | Stripe webhook endpoint secret (`whsec_…`) |
| `PAYPAL_CLIENT_ID` | All | PayPal app client ID (sandbox: from developer.paypal.com sandbox app) |
| `PAYPAL_CLIENT_SECRET` | All | PayPal app client secret (sandbox: from developer.paypal.com sandbox app) |
| `PAYPAL_AUTH_WEBHOOK_ID` | All | PayPal webhook ID (create via PayPal developer dashboard after first deploy) |
| `SENTRY_DSN` | All | Sentry DSN for backend error tracking |
| `STORE_CORS` | All | Allowed CORS origins — storefront URL (Vercel preview URL for staging) |
| `ADMIN_CORS` | All | Allowed CORS origins — admin UI URL |
| `AUTH_CORS` | All | Allowed CORS origins for auth endpoints |
| `MEDUSA_BACKEND_URL` | All | Public URL of this Railway service (used by admin panel) |
| `MEDUSA_WORKER_MODE` | Production | `worker` for async jobs (set on worker instance only) |

**How to obtain PayPal sandbox credentials:**
1. Sign in or create account at https://developer.paypal.com
2. Go to **Apps & Credentials** → **Create App** (sandbox mode)
3. Copy `Client ID` → `PAYPAL_CLIENT_ID`
4. Copy `Secret` → `PAYPAL_CLIENT_SECRET`
5. After first deploy, create a webhook in the PayPal dashboard pointing to `https://[railway-url]/hooks/payment/paypal_pp` and copy the Webhook ID → `PAYPAL_AUTH_WEBHOOK_ID`

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
