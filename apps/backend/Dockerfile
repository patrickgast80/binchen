# Build context: repo root (Railway service root directory = /)
# Dockerfile path: apps/backend/Dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
# Copy workspace manifests from repo root (pnpm-lock.yaml optional until first commit)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --filter @binchen/backend --prod

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --filter @binchen/backend
COPY apps/backend/ apps/backend/
RUN pnpm --filter @binchen/backend build

FROM base AS runner
WORKDIR /app/apps/backend
ENV NODE_ENV=production

# Copy pnpm virtual store + hoisted modules
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/apps/backend/.medusa ./.medusa
COPY --from=builder /app/apps/backend/package.json ./

EXPOSE 9000

# Run migrations then start (migrate is idempotent)
CMD ["sh", "-c", "node .medusa/server/src/main.js migrate && node .medusa/server/src/main.js"]
