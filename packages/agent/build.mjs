// Bundles the agent as ESM with code splitting, so each command loads only what it needs
// (Stricli's lazy command loaders become separate chunks). `ipp` and ws' optional natives stay
// external; bundled CommonJS dependencies get a `require` from the banner.
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(
  readFileSync(join(import.meta.dirname, "package.json"), "utf8"),
);
const outdir = join(import.meta.dirname, "dist");

rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: { cli: join(import.meta.dirname, "src/index.ts") },
  outdir,
  bundle: true,
  splitting: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  chunkNames: "chunks/[name]-[hash]",
  external: ["ipp", "bufferutil", "utf-8-validate"],
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  define: { __AGENT_VERSION__: JSON.stringify(version) },
  logLevel: "info",
});
