import { segment } from 'ts-routes';
import { api } from './api.routes';

export const root = {
  api: {
    ...segment`/api`,
    children: api,
  },
  ws: segment`/ws`,
};
