# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Prisma needs openssl on alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./scripts ./scripts
RUN npm install

COPY prisma ./prisma
# DATABASE_PROVIDER chooses the Prisma engine baked into this build.
# PostgreSQL is the only supported target: money uses DECIMAL(14,2) and
# Prisma's SQLite connector cannot generate that schema at all.
ARG DATABASE_PROVIDER=postgres
RUN node scripts/db-provider.mjs ${DATABASE_PROVIDER} && npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Keep only production dependencies for the runtime image.
RUN npm prune --omit=dev

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ARG DATABASE_PROVIDER=postgres
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# Overridden by compose / your orchestrator. There is deliberately no SQLite
# fallback: a container that silently created a local database would lose every
# row on the next deploy.
ENV DATABASE_URL="postgres://traveldesk:traveldesk-change-me@postgres:5432/traveldesk"
ENV UPLOAD_DIR="/app/data/uploads"

RUN apk add --no-cache openssl wget postgresql-client

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY package.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

RUN mkdir -p /app/data/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
