# Binchen – Handmade Baby & Children's Clothing Shop

Monorepo for the Binchen web shop.

## Structure

```
apps/
  storefront/   Next.js 14 App Router frontend (self-hosted via Coolify on Hetzner)
  backend/      MedusaJS commerce backend (self-hosted via Coolify on Hetzner)
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
| Staging | `staging.bilulu.de` | `api-staging.bilulu.de` |
| Production | `bilulu.de` | `api.bilulu.de` |

All environments run on the Hetzner host via Coolify (hosting consolidation,
see BIL-2396). Vercel/Render/Railway are disconnected.

## CI/CD

All pipelines live in `.github/workflows/`. See [infra/SECRETS.md](infra/SECRETS.md) for required secrets.

- **PR**: Lint, typecheck, build
- **Merge to `main`**: Coolify deploy via `coolify-deploy.yml` (see [infra/DEPLOY.md](infra/DEPLOY.md))

## Secrets

See [infra/SECRETS.md](infra/SECRETS.md) for the full inventory.

**Rule**: No secrets in repo. All runtime secrets live in the Coolify application environment on the Hetzner host.
