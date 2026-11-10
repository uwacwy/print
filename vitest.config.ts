import { defineConfig } from 'vitest/config';

/** Lets editor integrations run every package's vitest suite from the repo root. */
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
  },
});
