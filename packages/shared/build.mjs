import { build } from 'esbuild';

// tsc emits only declarations; extensionless imports are not valid Node ESM,
// so the runtime entry is bundled into a single file.
await build({
  bundle: true,
  entryPoints: ['src/index.ts'],
  external: ['ts-routes', 'zod'],
  format: 'esm',
  outfile: 'dist/index.js',
  platform: 'neutral',
  target: 'es2022',
});
