// @ts-check
import js from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier/flat';
import n from 'eslint-plugin-n';
import perfectionist from 'eslint-plugin-perfectionist';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

/** Oldest Node.js the agent supports: what a stock Raspberry Pi OS installs natively. */
const AGENT_NODE_VERSION = '>=20.17.0';

const PLATFORM_NEUTRAL = 'shared must stay platform-neutral.';
const NO_SELF_IMPORT = 'Use a relative import inside shared.';

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/node_modules/',
    '.angular/',
    'coverage/',
    'data/',
  ]),

  {
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    // Off here because disables for type-aware rules look unused; lint:typed reports them.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },

  {
    ...perfectionist.configs['recommended-natural'],
    rules: {
      // set internal pattern for shared imports
      'perfectionist/sort-imports': [
        'error',
        { internalPattern: ['^~app/'] },
      ],
    },
  },

  // Build scripts, tool configs, and repo scripts run on Node.
  {
    files: ['**/*.{js,mjs,cjs}', '*.ts', 'packages/*/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // The agent and everything bundled into it must run on the Pi's own Node.js.
  {
    files: ['packages/agent/**/*.ts', 'packages/shared/**/*.ts'],
    plugins: { n },
    rules: {
      'n/no-unsupported-features/es-builtins': 'error',
      'n/no-unsupported-features/es-syntax': 'error',
      'n/no-unsupported-features/node-builtins': 'error',
    },
    settings: { n: { version: AGENT_NODE_VERSION } },
  },

  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      // One entry: a second config block setting this rule would replace these options, not merge them.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              message: NO_SELF_IMPORT,
              name: '@uwacwy/print-shared',
            },
            ...builtinModules
              .filter((name) => !name.startsWith('node:'))
              .map((name) => ({
                message: PLATFORM_NEUTRAL,
                name,
              })),
          ],
          patterns: [
            { message: PLATFORM_NEUTRAL, regex: '^node:' },
            {
              message: NO_SELF_IMPORT,
              regex: '^@uwacwy/print-shared/',
            },
          ],
        },
      ],
    },
  },

  {
    extends: [angular.configs.tsRecommended],
    files: ['packages/server/src/**/*.ts'],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        {
          prefix: 'app',
          style: 'kebab-case',
          type: ['element', 'attribute'],
        },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { prefix: 'app', style: 'camelCase', type: 'attribute' },
      ],
    },
  },
  {
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    files: ['packages/server/src/**/*.html'],
  },
  {
    files: ['packages/server/src/**/*.html'],
    ignores: [
      // Inline test-host templates and the static shell are not translated.
      'packages/server/src/**/*.spec.ts/**',
      'packages/server/src/index.html',
    ],
    rules: {
      '@angular-eslint/template/i18n': [
        'error',
        {
          checkAttributes: true,
          checkId: true,
          checkText: true,
          // Identifiers, ARIA references, and enums that never reach the reader as text.
          ignoreAttributes: [
            'aria-describedby',
            'aria-labelledby',
            'aria-live',
            'context',
            'inputId',
            'inputmode',
            'rel',
            'variant',
          ],
        },
      ],
    },
  },

  prettier,

  // After eslint-config-prettier, which turns `curly` off; `all` does not conflict with Prettier.
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      curly: ['error', 'all'],
      'prefer-arrow-callback': 'error',
    },
  },
);
