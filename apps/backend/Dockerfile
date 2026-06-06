# Build context: apps/backend/ (Railway rootDirectory = apps/backend)
# dockerfilePath in railway.toml is apps/backend/Dockerfile (root-relative).
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.0.0
COPY package.json ./
RUN pnpm install --no-frozen-lockfile --node-linker=hoisted
COPY . .
RUN node_modules/.bin/medusa build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9.0.0
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile --node-linker=hoisted
COPY --from=builder /app/.medusa .medusa/
ENV NODE_ENV=production
EXPOSE 9000
CMD ["node", ".medusa/server/src/main.js"]
