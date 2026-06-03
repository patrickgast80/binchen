# Binchen – Handmade Baby & Children's Clothing Shop

Monorepo for the Binchen web shop.

## Structure

```
apps/
  storefront/   Next.js 14 App Router frontend (deployed to Vercel)
  backend/      MedusaJS commerce backend (deployed to Railway)
infra/
  SECRETS.md    Secrets inventory and rotation plan
.github/
  workflows/    CI/CD pipelines
```

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker (for Postgres locally)

### Install
```bash
pnpm install
```

### Run locally
```bash
# Start Postgres
docker compose up -d db

# Start Medusa backend
cd apps/backend && pnpm dev

# Start Next.js storefront (new terminal)
cd apps/storefront && pnpm dev
```

## Environments

| Environment | Frontend | Backend |
|-------------|----------|---------|
| Preview | Vercel preview URL (per PR) | Railway preview service |
| Staging | `staging.binchen.de` (TBD) | Railway staging service |
| Production | `binchen.de` (TBD) | Railway production service |

## CI/CD

All pipelines live in `.github/workflows/`. See [infra/SECRETS.md](infra/SECRETS.md) for required secrets.

- **PR**: Lint, typecheck, build, Vercel preview deploy
- **Merge to `main`**: Deploy storefront to Vercel staging, deploy backend to Railway staging
- **Manual/tag**: Deploy to production (requires CEO approval)

## Secrets

See [infra/SECRETS.md](infra/SECRETS.md) for the full inventory.

**Rule**: No secrets in repo. All secrets live in Vercel project env (frontend) or Railway environment variables (backend).
