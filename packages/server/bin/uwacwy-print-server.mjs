#!/usr/bin/env node
import { createRequire } from "node:module";
import { resolve } from "node:path";

const usage = `Usage: uwacwy-print-server [env-file]

Serves the Quick Print web app, REST API, and print-agent sockets on one port.
Settings come from the environment, or from env-file (default: ./.env when present);
existing environment variables win. See .env.example in this package.`;

const [argument] = process.argv.slice(2);
if (argument === "--help" || argument === "-h") {
  console.log(usage);
  process.exit(0);
}
if (argument === "--version" || argument === "-v") {
  console.log(
    createRequire(import.meta.url)("../package.json").version,
  );
  process.exit(0);
}
if (argument) {
  process.env.PRINT_ENV_FILE = resolve(argument);
}

// The npm bin is a symlink, so the server cannot detect it is the entry point on its own.
globalThis.uwacwyPrintServerMain = true;
process.env.NODE_ENV ??= "production";
await import("../dist/server/server.mjs");
