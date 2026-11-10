// @ts-check
// Type-aware rules are slow, so the editor uses eslint.config.mjs and this runs as `lint:typed`.
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

import base from './eslint.config.mjs';

const files = ['packages/*/src/**/*.ts'];

// basePath keeps the globs anchored here when packages run `eslint -c ../../eslint.typecheck.config.mjs`.
export default defineConfig({
  basePath: import.meta.dirname,
  extends: [
    base,
    tseslint.configs.recommendedTypeChecked.map((config) => ({
      ...config,
      files,
    })),
    {
      files,
      languageOptions: {
        parserOptions: {
          // Explicit, because each package's tsconfig.json leaves its tests to tsconfig.test.json.
          project: [
            'packages/shared/tsconfig.test.json',
            'packages/agent/tsconfig.json',
            'packages/agent/tsconfig.test.json',
            'packages/server/tsconfig.app.json',
            'packages/server/tsconfig.spec.json',
            'packages/server/tsconfig.test.json',
          ],
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      linterOptions: { reportUnusedDisableDirectives: 'error' },
    },
    {
      // Fakes implement async signatures without awaiting, and `expect(obj.method)` is not a call.
      files: ['packages/*/src/**/*.{spec,test}.ts'],
      rules: {
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    {
      // nativeElement, Response.json(), and vitest's asymmetric matchers are all typed `any`.
      files: ['packages/*/src/**/*.{spec,test}.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
  ],
});
