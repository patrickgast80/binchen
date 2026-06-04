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
RUN pnpm install --filter @binchen/backend --prod --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --filter @binchen/backend --ignore-scripts
COPY apps/backend/ apps/backend/
RUN pnpm --filter @binchen/backend build

FROM base AS runner
WORKDIR /app/apps/backend
ENV NODE_ENV=production

# Copy workspace manifests needed for module resolution
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/.medusa ./.medusa
COPY --from=builder /app/apps/backend/package.json ./

EXPOSE 9000

CMD ["node", ".medusa/server/src/main.js"]
