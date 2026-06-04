# Build context: repo root (Railway service root directory = /)
# Dockerfile path: apps/backend/Dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --filter @binchen/backend --shamefully-hoist
COPY apps/backend/ apps/backend/
# Pre-compile medusa-config.ts so medusa build loads plain JS (avoids ts-node/jiti issues)
RUN node_modules/.bin/esbuild apps/backend/medusa-config.ts \
    --bundle=false --platform=node --format=cjs \
    --outfile=apps/backend/medusa-config.js
RUN pnpm --filter @binchen/backend build

FROM node:20-alpine AS runner
RUN npm install -g pnpm@9
WORKDIR /app

# Copy everything needed (including pnpm virtual store)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
COPY apps/e2e/package.json apps/e2e/

# Install prod deps fresh in runner (avoids symlink issues with multi-stage copy)
RUN pnpm install --filter @binchen/backend --prod --shamefully-hoist

# Copy compiled Medusa app
COPY --from=builder /app/apps/backend/.medusa apps/backend/.medusa

WORKDIR /app/apps/backend
ENV NODE_ENV=production
EXPOSE 9000

# medusa build output runs migrations + starts server
CMD ["node", ".medusa/server/src/main.js"]
