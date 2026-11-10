import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.base';

/** API and pure-helper tests; Angular component specs run under `ng test`. */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: [
        'src/**/*.test.ts',
        'src/app/auth/msal.config.spec.ts',
      ],
      name: 'server',
    },
  }),
);
