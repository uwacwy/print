import { segment } from 'ts-routes';

import { api } from './api.routes';
import { installRoutes } from './install.routes';

export const root = {
  ...installRoutes,
  api: {
    ...segment`/api`,
    children: api,
  },
  ws: segment`/ws`,
};
