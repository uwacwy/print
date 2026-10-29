FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY server/package.json server/tsconfig.json ./server/
COPY agent/package.json agent/tsconfig.json ./agent/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY shared/src ./shared/src
COPY server/src ./server/src
COPY agent/src ./agent/src
RUN npm run build

FROM deps AS dev
ENV NODE_ENV=development
RUN cp package-lock.json .installed-package-lock.json
CMD ["/bin/sh", "-ec", "if ! cmp -s package-lock.json .installed-package-lock.json; then npm ci --no-audit --no-fund; cp package-lock.json .installed-package-lock.json; fi; ./node_modules/.bin/tsc -b shared server; ./node_modules/.bin/tsc -b shared server --watch --preserveWatchOutput & exec node --watch server/dist/index.js"]

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
RUN mkdir -p /data/jobs && chown -R node:node /app /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
