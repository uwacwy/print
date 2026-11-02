import express from 'express';
import type { PrintDatabase } from './helpers/database/database';
import type { AgentHub } from './sockets/agent-hub/agent-hub';
import type { UploadConfig } from '../server-config';
import type { EntraUserOptions } from './middleware/auth/entra-user/entra-user.strategy';
import { createAuthenticate } from './middleware/auth/passport/passport';
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
    .get('/status', (_request, response) => {
      response.set('cache-control', 'no-store').json({
        printersOnline: options.getHub().onlinePrinterIds().length,
      });
    })
    .use('/session', sessionRouter({ authenticate }))
    .use('/printers', printersRouter({ ...options, authenticate }));
};
