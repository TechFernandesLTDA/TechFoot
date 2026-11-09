# syntax=docker/dockerfile:1

FROM node:22.23.4-slim AS build
WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/package.json
COPY apps/e2e/package.json apps/e2e/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
ENV DATABASE_URL=file:./dev.db
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @techfoot/web

FROM node:22.23.4-slim AS api
WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && groupadd --system --gid 10001 appgroup \
 && useradd --system --uid 10001 --gid appgroup --home-dir /app --no-create-home appuser
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/package.json
COPY apps/e2e/package.json apps/e2e/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
ENV DATABASE_URL=file:/data/techfoot.db
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev \
 && npm cache clean --force
COPY --chown=10001:10001 apps/api/src apps/api/src
COPY --chown=10001:10001 apps/api/prisma apps/api/prisma
COPY --chown=10001:10001 apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
COPY --chown=10001:10001 packages/engine/src packages/engine/src
COPY --chown=10001:10001 packages/engine/package.json packages/engine/package.json
COPY --chown=10001:10001 packages/shared/src packages/shared/src
COPY --chown=10001:10001 packages/shared/package.json packages/shared/package.json
COPY --chown=10001:10001 data/world/liga-br.json data/world/liga-br.json
RUN mkdir -p /data && chown -R 10001:10001 /app /data
USER 10001:10001
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/techfoot.db \
    PORT=3333 \
    TRUST_PROXY=true
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "apps/api/docker-entrypoint.sh"]

FROM nginxinc/nginx-unprivileged:1.27.4-alpine AS web
USER root
RUN addgroup -g 10001 -S appgroup \
 && adduser -S -D -H -u 10001 -G appgroup appuser \
 && chown -R 10001:10001 /usr/share/nginx/html /var/cache/nginx /var/log/nginx /tmp /etc/nginx/conf.d
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=10001:10001 /app/apps/web/dist /usr/share/nginx/html
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
