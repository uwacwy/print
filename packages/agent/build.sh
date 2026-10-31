#!/usr/bin/env bash

npm install

node_modules/.bin/tsc -p tsconfig.json --noEmit && node_modules/.bin/esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=esm \
  --external:ipp \
  --external:bufferutil \
  --external:utf-8-validate \
  --outfile=../../dist/print-agent/index.mjs
