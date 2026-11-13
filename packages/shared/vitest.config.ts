import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.base.ts';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      name: 'shared',
    },
  }),
);
