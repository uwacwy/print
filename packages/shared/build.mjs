import { build } from "esbuild";

// tsc emits only declarations; extensionless imports are not valid Node ESM,
// so the runtime entry is bundled into a single file.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});
