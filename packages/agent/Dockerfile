# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f packages/agent/Dockerfile .
# The bundle is plain JavaScript, so it is built once on the build platform and
# installed into each target architecture (linux/amd64, linux/arm64).

FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json LICENSE ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/agent/package.json ./packages/agent/
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY scripts ./scripts
COPY packages/shared/src ./packages/shared/src
COPY packages/agent ./packages/agent
RUN npm run build:agent && npm pack -w @uwacwy/print-agent --pack-destination /tmp

FROM node:24-bookworm-slim AS runtime
ARG VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="uwacwy print-agent" \
      org.opencontainers.image.description="United Way Quick Print agent: prints queued jobs through CUPS or IPP" \
      org.opencontainers.image.source="https://github.com/uwacwy/print" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
# cups-client provides lp, lpstat, and cupsenable for cups:// printers; ghostscript
# downsamples images before lp and converts PDF to PCLm for ipp:// printers without PDF support.
RUN apt-get update \
 && apt-get install -y --no-install-recommends cups-client ghostscript \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /tmp/uwacwy-print-agent-*.tgz /tmp/
RUN npm install --global --omit=dev --no-audit --no-fund /tmp/uwacwy-print-agent-*.tgz \
 && rm /tmp/uwacwy-print-agent-*.tgz && npm cache clean --force
ENV NODE_ENV=production
USER node
ENTRYPOINT ["uwacwy-print-agent"]
CMD ["run"]
