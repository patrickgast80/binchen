# Build context: repo root
# dockerfilePath: ./apps/backend/Dockerfile  (used by the Coolify build)
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.0.0
# Copy workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/
# Install backend deps with hoisted node_modules (Medusa requires flat dep tree)
RUN pnpm install --filter @binchen/backend --frozen-lockfile --shamefully-hoist
# Copy backend source only (keeps build context cache-friendly)
COPY apps/backend/ apps/backend/
# Pre-transpile medusa-config.ts AND every src/modules/**/*.ts into sibling .js.
# defineConfig() in @medusajs/utils require()s each local module resolve path at
# config-load time (i.e. before `medusa build` emits .medusa/server), so the
# referenced ./src/modules/<name> needs a .js entrypoint right next to the .ts
# source. The TypeScript compiler is already installed as a devDep.
RUN cd apps/backend && node scripts/pretranspile-config.js
# Build Medusa — compiles TS and generates .medusa/server artifact
RUN pnpm --filter @binchen/backend build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9.0.0
# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/
# Production deps only
RUN pnpm install --filter @binchen/backend --prod --frozen-lockfile --shamefully-hoist
# Copy compiled Medusa app and pre-transpiled config from builder
# medusa-config.js is needed by both db:migrate and main.js at runtime
COPY --from=builder /app/apps/backend/.medusa apps/backend/.medusa
COPY --from=builder /app/apps/backend/medusa-config.js apps/backend/medusa-config.js
# medusa-config.js references local modules by their TS source path
# (e.g. "./src/modules/email"). Node resolves these at runtime relative to
# medusa-config.js, so the runner needs the *compiled* sibling tree there.
# Use .medusa/server/src (which Medusa's build step emits) shaped as ./src
# so Node's require() finds the compiled .js. Without this, any local-source
# module added to the config blows up boot with
# "Cannot find module '/app/apps/backend/src/modules/<name>'".
COPY --from=builder /app/apps/backend/.medusa/server/src apps/backend/src

WORKDIR /app/apps/backend
ENV NODE_ENV=production
EXPOSE 9000
# BIL-2511: HEALTHCHECK makes Coolify's deploy cutover health-gated. Without it,
# Coolify marks the new container healthy instantly and stops the old one while
# Medusa is still migrating/seeding (~45s of 502 on every deploy). With it,
# Coolify waits for "healthy" before removing the old container, and rolls back
# (old container keeps serving) if the new one never gets healthy.
# Coolify parses these --flags into its own wait loop on every deploy, so this
# line is the single source of truth for cutover timing:
#   boot tolerance ≈ start-period + retries*interval = 30s + 30*5s = 180s.
# /health only responds once `medusa start` listens, i.e. after all boot steps.
HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=30 \
  CMD node -e "require('http').get('http://127.0.0.1:9000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
# Startup sequence (all steps idempotent — safe on every boot):
# 1. db:migrate          — apply pending migrations
# 2. medusa user         — create first admin if MEDUSA_ADMIN_EMAIL is set and no users exist yet
# 3. seed.js             — catalog seed (exits early if products already exist)
# 4. seed-shipping.js    — regions + flat-rate shipping (BIL-31, idempotent)
# 5. seed-payments.js    — link pp_system_default (Vorkasse) + pp_paypal (when configured) to every region (BIL-2394)
# 6. seed-inventory.js   — sales-channel<->location link + ≥25 stocked qty per variant (BIL-2386)
# 7. medusa start        — serve the app
#
# BIL-2175 debug hooks (set on the Coolify service when migrations stall):
# - BACKEND_MIGRATE_DEBUG=true  → MIKRO_ORM_DEBUG + --verbose: dumps every SQL the
#   migrator runs so the exact hung module/query is visible in container logs.
# - BACKEND_DB_LOGGING=true     → enables Medusa's databaseLogging in medusa-config.
CMD ["sh", "-c", "\
  if [ \"$BACKEND_MIGRATE_DEBUG\" = \"true\" ]; then export MIKRO_ORM_DEBUG=true; MIGRATE_FLAGS=\"--verbose\"; else MIGRATE_FLAGS=\"\"; fi && \
  /app/node_modules/.bin/medusa db:migrate $MIGRATE_FLAGS && \
  if [ -n \"$MEDUSA_ADMIN_EMAIL\" ] && [ -n \"$MEDUSA_ADMIN_PASSWORD\" ]; then \
    /app/node_modules/.bin/medusa user -e \"$MEDUSA_ADMIN_EMAIL\" -p \"$MEDUSA_ADMIN_PASSWORD\" 2>/dev/null || true; \
  fi && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/seed.js 2>/dev/null || true && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/seed-shipping.js 2>/dev/null || true && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/cleanup-stripe-region-links.js 2>/dev/null || true && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/seed-payments.js 2>/dev/null || true && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/seed-inventory.js 2>/dev/null || true && \
  exec /app/node_modules/.bin/medusa start \
"]
