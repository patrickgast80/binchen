# Build context: repo root (Railway service root directory = /)
# Dockerfile path: apps/backend/Dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/
# Use shamefully-hoist so all packages end up in /app/node_modules (no symlinks to break)
RUN pnpm install --filter @binchen/backend --prod --shamefully-hoist

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --filter @binchen/backend --shamefully-hoist
COPY apps/backend/ apps/backend/
RUN pnpm --filter @binchen/backend build

FROM base AS runner
WORKDIR /app/apps/backend
ENV NODE_ENV=production

# All modules hoisted to /app/node_modules — no symlinks needed
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/apps/backend/.medusa ./.medusa
COPY --from=builder /app/apps/backend/package.json ./

# Expose the Medusa API port
EXPOSE 9000

# Just start the server — migrations run via railway.toml preDeployCommand
CMD ["node", ".medusa/server/src/main.js"]
