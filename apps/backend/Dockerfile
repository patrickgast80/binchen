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
# ts-node is not in pnpm-lock.yaml but @medusajs/cli/cli.js requires it at build time
# to register TypeScript so medusa-config.ts can be loaded. Install outside pnpm to
# avoid touching package.json/pnpm-lock.yaml.
RUN npm install --prefix /app --no-save ts-node@10 tsconfig-paths@4
# Copy backend source only (keeps build context cache-friendly)
COPY apps/backend/ apps/backend/
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
# Copy compiled Medusa app from builder
COPY --from=builder /app/apps/backend/.medusa apps/backend/.medusa

WORKDIR /app/apps/backend
ENV NODE_ENV=production
EXPOSE 9000
# Runs db:migrate before starting (idempotent — safe on every boot)
CMD ["sh", "-c", "/app/node_modules/.bin/medusa db:migrate && node .medusa/server/src/main.js"]
