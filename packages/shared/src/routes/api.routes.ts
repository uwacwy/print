import { segment } from 'ts-routes';

import { agents } from './api.agents.routes';
import { printers } from './api.printers.routes';

export const api = {
  agent: { ...segment`/agent`, children: agents },
  clientConfig: segment`/client-config`,
  healthz: segment`/healthz`,
  printers: { ...segment`/printers`, children: printers },
  session: { ...segment`/session` },
  status: segment`/status`,
};
