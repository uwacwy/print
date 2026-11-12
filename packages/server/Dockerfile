# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f packages/server/Dockerfile .

FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json tsconfig.json angular.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/agent/package.json packages/agent/tsconfig.json ./packages/agent/
RUN npm ci --no-audit --no-fund

# Development: ng serve with HMR (see compose.yml). socket.io listens on a loopback
# side port and proxy.conf.mjs forwards /ws to it.
FROM deps AS dev
ENV NODE_ENV=development
RUN cp package-lock.json .installed-package-lock.json
CMD ["/bin/sh", "-ec", "if ! cmp -s package-lock.json .installed-package-lock.json; then npm ci --no-audit --no-fund; cp package-lock.json .installed-package-lock.json; fi; npm run build -w @uwacwy/print-shared; SOCKET_DEV_PORT=${SOCKET_DEV_PORT:-4201} exec ./node_modules/.bin/ng serve print-server --host 0.0.0.0 --port 4200"]

FROM deps AS build
COPY LICENSE ./
COPY scripts ./scripts
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
# Angular imports server.ts to extract routes, which validates the config. These placeholders
# exist only for this RUN; real values are supplied when the container starts.
RUN PUBLIC_URL=http://localhost:8080 UPLOAD_TOKEN_SECRET=build-time-placeholder-not-a-secret-0000 \
    npm run build -w @uwacwy/print-shared -w @uwacwy/print-server && npm pack -w @uwacwy/print-server --pack-destination /tmp

# Installs the same tarball that is published to npm, with production dependencies only.
FROM deps AS install
COPY --from=build /tmp/uwacwy-print-server-*.tgz /tmp/
RUN npm install --global --omit=dev --no-audit --no-fund /tmp/uwacwy-print-server-*.tgz

FROM node:24-bookworm-slim AS runtime
ARG VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="uwacwy print-server" \
      org.opencontainers.image.description="United Way Quick Print server: web app, REST API, and print agent socket" \
      org.opencontainers.image.source="https://github.com/uwacwy/print" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
COPY --from=install /usr/local/lib/node_modules/@uwacwy /usr/local/lib/node_modules/@uwacwy
RUN ln -s ../lib/node_modules/@uwacwy/print-server/bin/uwacwy-print-server.mjs /usr/local/bin/uwacwy-print-server \
 && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Serves the web app, REST API, and the agent socket (/ws) from one process.
ENTRYPOINT ["uwacwy-print-server"]
