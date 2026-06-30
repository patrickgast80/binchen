# syntax=docker/dockerfile:1.7

# Multi-stage build for the Next.js storefront (apps/storefront).
# Targets Coolify / generic Docker hosts. No Vercel-specific runtime deps.
#
# Build context expected: monorepo root (so we can use the workspace lockfile).
# Build command:   docker build -f apps/storefront/Dockerfile -t bilulu-storefront .
# Run command:     docker run --rm -p 3000:3000 --env-file apps/storefront/.env.local bilulu-storefront
#
# BIL-2176: Coolify injects extra --build-arg flags (COOLIFY_*, NEXT_PUBLIC_*,
# PORT, HOSTNAME, COOLIFY_BUILD_SECRETS_HASH). Declaring them as no-op ARGs in
# a global pre-stage block silences BuildKit warnings, prevents any host shell
# env from being accidentally picked up as build-time env, and gives Coolify
# a stable hash for its layer cache. NODE_ENV is intentionally NOT declared as
# a global ARG so the deps stage always installs devDependencies (next/sharp
# postinstall scripts + typescript), regardless of the build host's NODE_ENV.

ARG COOLIFY_URL
ARG COOLIFY_FQDN
ARG COOLIFY_BRANCH
ARG COOLIFY_RESOURCE_UUID
ARG COOLIFY_BUILD_SECRETS_HASH
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_BASE_URL
ARG PORT
ARG HOSTNAME

# ---------- 1. deps: install workspace deps with frozen lockfile ----------
FROM node:20-slim AS deps
WORKDIR /app

# Force devDependencies install regardless of the build host's NODE_ENV /
# `--build-arg NODE_ENV=production`. pnpm 9 treats NODE_ENV=production as
# implicit `--prod`, which would strip TypeScript (devDep) and break the
# Next.js Webpack compile in the builder stage.
ENV NODE_ENV=development
ENV CI=true

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/storefront/package.json apps/storefront/package.json

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false --filter=storefront...

# ---------- 2. builder: build standalone Next.js output ----------
FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/storefront/node_modules ./apps/storefront/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/storefront ./apps/storefront

# Fail fast and loud if the COPY above silently dropped the source tree.
# BIL-2176 surfaced as `Module not found: @/components/ui/button` in Coolify
# while local builds with identical flags succeeded — log a fingerprint of
# the storefront tree so the build log itself proves whether the source
# files reached the builder layer.
RUN echo "--- BIL-2176 storefront tree fingerprint ---" \
 && ls -la /app/apps/storefront \
 && ls -la /app/apps/storefront/src/components/ui \
 && ls -la /app/apps/storefront/src/lib \
 && test -f /app/apps/storefront/src/components/ui/button.tsx \
 && test -f /app/apps/storefront/src/components/ui/input.tsx \
 && test -f /app/apps/storefront/src/lib/cart-cookie.ts \
 && echo "--- BIL-2176 fingerprint ok ---"

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
