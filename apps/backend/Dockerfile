# Build context: apps/backend/ (Railway rootDirectory = apps/backend)
# dockerfilePath in railway.toml is apps/backend/Dockerfile (root-relative).
FROM node:20-alpine AS base
RUN npm install -g pnpm@9.0.0

FROM base AS builder
WORKDIR /app
COPY package.json ./
RUN pnpm install --no-frozen-lockfile --shamefully-hoist
COPY . .
# Pre-compile TypeScript so Medusa can inspect modules without ts-node
RUN node_modules/.bin/esbuild \
    medusa-config.ts \
    src/modules/catalog/index.ts \
    src/modules/catalog/service.ts \
    src/modules/catalog/models/product-metadata.ts \
    src/api/store/products/route.ts \
    src/scripts/seed.ts \
    --bundle=false --platform=node --format=cjs \
    --outdir=. --outbase=.
RUN node_modules/.bin/medusa build

FROM node:20-alpine AS runner
RUN npm install -g pnpm@9.0.0
WORKDIR /app
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile
COPY --from=builder /app/.medusa .medusa/
ENV NODE_ENV=production
EXPOSE 9000
CMD ["node", ".medusa/server/src/main.js"]
