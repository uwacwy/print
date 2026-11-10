import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the tsconfig `paths` entry so tests use the shared source, not a build.
    alias: {
      '@uwacwy/print-shared': fileURLToPath(
        new URL('./shared/src/index.ts', import.meta.url),
      ),
    },
  },
});
