FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json tsconfig.json angular.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY packages/server/package.json ./packages/server/
COPY packages/agent/package.json packages/agent/tsconfig.json ./packages/agent/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY shared/src ./shared/src
COPY packages ./packages
RUN npm run build

FROM deps AS dev
ENV NODE_ENV=development
RUN cp package-lock.json .installed-package-lock.json
# ng serve on 4200 (HMR); socket.io is served on a loopback side port and proxied via proxy.conf.mjs.
CMD ["/bin/sh", "-ec", "if ! cmp -s package-lock.json .installed-package-lock.json; then npm ci --no-audit --no-fund; cp package-lock.json .installed-package-lock.json; fi; ./node_modules/.bin/tsc -b shared; SOCKET_DEV_PORT=${SOCKET_DEV_PORT:-4201} exec ./node_modules/.bin/ng serve print-server --host 0.0.0.0 --port 4200"]

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/dist/print-server ./dist/print-server
RUN mkdir -p /data/jobs && chown -R node:node /app /data
USER node
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Serves SSR pages, the REST API, and socket.io (at /ws) from one process.
CMD ["node", "dist/print-server/server/server.mjs"]
