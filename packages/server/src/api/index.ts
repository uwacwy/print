import express from 'express';
import type { PrintDatabase } from '../lib/database/database.js';
import type { AgentHub } from '../realtime/agent-hub';
import type { UploadConfig } from '../server-config';
import type { EntraUserOptions } from './middleware/auth/entra-user/entra-user.strategy';
import { createAuthenticate } from './middleware/auth/passport/passport';
import eventsRouter from './routers/events/events.router';
import printersRouter from './routers/printers/printers.router';
import sessionRouter from './routers/session/session.router';

export interface ApiRootOptions {
  entra: EntraUserOptions;
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  upload: UploadConfig;
  publicUrl?: URL;
}

/** `/api`: each segment's router declares the credentials every endpoint accepts. */
export default (options: ApiRootOptions) => {
  const authenticate = createAuthenticate({
    db: options.db,
    entra: options.entra,
    uploadToken: options.upload.access,
  });
  return express
    .Router()
    .get('/healthz', (_request, response) =>
      response.status(200).json({ status: 'ok' }),
    )
    .use('/session', sessionRouter({ authenticate }))
    .use(
      '/events',
      eventsRouter({ getHub: options.getHub, authenticate }),
    )
    .use('/printers', printersRouter({ ...options, authenticate }));
};
