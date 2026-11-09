# syntax=docker/dockerfile:1

FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/package.json
COPY apps/e2e/package.json apps/e2e/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
ENV DATABASE_URL=file:./dev.db
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    npm ci
COPY . .
RUN npm run build -w @techfoot/web

FROM node:22-slim AS api
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system appgroup && useradd --system --gid appgroup --create-home appuser
COPY --from=build --chown=appuser:appgroup /app /app
RUN mkdir -p /data && chown appuser:appgroup /data
USER appuser
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/techfoot.db \
    PORT=3333
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "apps/api/docker-entrypoint.sh"]

FROM nginx:1.27.4-alpine AS web
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
  && touch /tmp/nginx.pid && chown nginx:nginx /tmp/nginx.pid
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
