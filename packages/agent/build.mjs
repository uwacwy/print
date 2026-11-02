// Bundles the agent into one CommonJS file; only `ipp` (and ws' optional natives) stay external.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(
  readFileSync(join(import.meta.dirname, "package.json"), "utf8"),
);

await build({
  entryPoints: [join(import.meta.dirname, "src/index.ts")],
  outfile: join(import.meta.dirname, "dist/print-agent.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["ipp", "bufferutil", "utf-8-validate"],
  banner: { js: "#!/usr/bin/env node" },
  define: { __AGENT_VERSION__: JSON.stringify(version) },
  logLevel: "info",
});
