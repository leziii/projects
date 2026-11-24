# syntax=docker/dockerfile:1
# E15-2 (round 62): one Dockerfile, two images.
#   server: the API (NestJS) with only what it needs to run.
#   web:    Caddy with the built app and admin, automatic HTTPS, /api passed to the server.
# Built by deploy/docker-compose.yml; see deploy/README.md.

FROM node:22-alpine AS build
WORKDIR /src
# An extra CA certificate is only for building behind a company proxy: docker build --secret id=ca,src=ca.crt
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; npm install -g pnpm@10.0.0
COPY . .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; pnpm install --frozen-lockfile
RUN pnpm --filter @pawpal/shared build \
 && pnpm --filter @pawpal/server build \
 && pnpm --filter @pawpal/admin-web build \
 && pnpm --filter @pawpal/mobile build
# Only what the server needs to run: its production packages and the shared code.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    rm -rf node_modules */node_modules && pnpm install --prod --frozen-lockfile --filter "@pawpal/server..."

FROM node:22-alpine AS server
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/shared/package.json ./shared/package.json
COPY --from=build /src/shared/dist ./shared/dist
COPY --from=build /src/server/package.json ./server/package.json
COPY --from=build /src/server/node_modules ./server/node_modules
COPY --from=build /src/server/dist ./server/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"' || exit 1
WORKDIR /app/server
CMD ["node", "dist/main.js"]

FROM caddy:2 AS web
COPY --from=build /src/mobile/dist/build/h5 /srv/app
COPY --from=build /src/admin-web/dist /srv/admin
COPY deploy/Caddyfile /etc/caddy/Caddyfile
