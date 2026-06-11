# Build context: repo root
# dockerfilePath: ./apps/backend/Dockerfile  (used by both Railway and Render)
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
# dynamicImport() in @medusajs/utils uses require() with no extension, so Node tries
# medusa-config.js before medusa-config.ts. Pre-transpile the config using the
# TypeScript compiler already installed as a devDep — no npm/ts-node needed.
RUN node -e "const ts=require('/app/node_modules/typescript');const fs=require('fs');const r=ts.transpileModule(fs.readFileSync('apps/backend/medusa-config.ts','utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true,allowSyntheticDefaultImports:true}});fs.writeFileSync('apps/backend/medusa-config.js',r.outputText);console.log('pre-transpiled medusa-config.js');"
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
# medusa-config.js, so the runner needs the source tree too. Without this,
# any local-source module added to the config blows up boot with
# "Cannot find module '/app/apps/backend/src/modules/<name>'".
COPY --from=builder /app/apps/backend/src apps/backend/src

WORKDIR /app/apps/backend
ENV NODE_ENV=production
EXPOSE 9000
# Startup sequence (all steps idempotent — safe on every boot):
# 1. db:migrate          — apply pending migrations
# 2. medusa user         — create first admin if MEDUSA_ADMIN_EMAIL is set and no users exist yet
# 3. seed.js             — catalog seed (exits early if products already exist)
# 4. seed-shipping.js    — regions + flat-rate shipping (BIL-31, idempotent)
# 5. medusa start        — serve the app
CMD ["sh", "-c", "\
  /app/node_modules/.bin/medusa db:migrate && \
  if [ -n \"$MEDUSA_ADMIN_EMAIL\" ] && [ -n \"$MEDUSA_ADMIN_PASSWORD\" ]; then \
    /app/node_modules/.bin/medusa user -e \"$MEDUSA_ADMIN_EMAIL\" -p \"$MEDUSA_ADMIN_PASSWORD\" 2>/dev/null || true; \
  fi && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/seed.js 2>/dev/null || true && \
  /app/node_modules/.bin/medusa exec .medusa/server/src/scripts/seed-shipping.js 2>/dev/null || true && \
  exec /app/node_modules/.bin/medusa start \
"]
