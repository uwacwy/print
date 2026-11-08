import { segment } from 'ts-routes';
import { agents } from './api.agents.routes';
import { printers } from './api.printers.routes';

export const api = {
  healthz: segment`/healthz`,
  status: segment`/status`,
  clientConfig: segment`/client-config`,
  agent: { ...segment`/agent`, children: agents },
  session: { ...segment`/session` },
  printers: { ...segment`/printers`, children: printers },
};
