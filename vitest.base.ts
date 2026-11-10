import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Settings every package's vitest config merges in. */
export default defineConfig({
  resolve: {
    // Mirrors the tsconfig `paths` entry so tests use the shared source, not a build.
    alias: {
      '@uwacwy/print-shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
});
