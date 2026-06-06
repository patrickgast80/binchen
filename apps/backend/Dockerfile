# Build context: apps/backend/ (Railway rootDirectory = apps/backend)
# dockerfilePath in railway.toml is apps/backend/Dockerfile (root-relative).
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN node_modules/.bin/medusa build

FROM node:20-alpine AS runner
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY --from=builder /app/.medusa .medusa/
ENV NODE_ENV=production
EXPOSE 9000
CMD ["node", ".medusa/server/src/main.js"]
