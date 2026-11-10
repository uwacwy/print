import { arg, createRouting, query, segment } from 'ts-routes';

import { api } from './api.routes';
import { installRoutes } from './install.routes';

export const root = {
  ...installRoutes,
  api: {
    ...segment`/api`,
    children: api,
  },
  print: {
    ...segment`/print`,
    children: {
      $slug: {
        ...segment`/${arg('slug')}`,
        query: { token: query('optional') },
      },
    },
  },
  ws: segment`/ws`,
};

export const $ = createRouting(root);
