# syntax=docker/dockerfile:1.7

# Multi-stage build for the Next.js storefront (apps/storefront).
# Targets Coolify / generic Docker hosts. No Vercel-specific runtime deps.
#
# Build context expected: monorepo root (so we can use the workspace lockfile).
# Build command:   docker build -f apps/storefront/Dockerfile -t bilulu-storefront .
# Run command:     docker run --rm -p 3000:3000 --env-file apps/storefront/.env.local bilulu-storefront

# ---------- 1. deps: install workspace deps with frozen lockfile ----------
FROM node:20-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/storefront/package.json apps/storefront/package.json

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter=storefront...

# ---------- 2. builder: build standalone Next.js output ----------
FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/storefront/node_modules ./apps/storefront/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/storefront ./apps/storefront

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm --filter=storefront build

# ---------- 3. runner: minimal runtime image ----------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone Next output ships its own minimal node_modules + server.js.
# We also copy public and .next/static which standalone does NOT include.
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/public ./apps/storefront/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static

USER nextjs

EXPOSE 3000

# Lightweight TCP healthcheck — Coolify can override with HTTP if desired.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/storefront/server.js"]
