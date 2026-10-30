import express from 'express';
import {
  createAdminAuth,
  type EntraAccessTokenVerifier,
  type EntraAdminAuthOptions,
} from './admin-auth';
import eventsRouter from './events.router';
import { adminPrintersRouter } from './printers.router';
import printersRouter from './printers.router';
import uploadRouter from './upload.router';
import type { PrintDatabase } from '../lib/database/database.js';
import type { UploadConfig } from '../server-config';
import type { AgentHub } from '../realtime/agent-hub';

export interface ApiRootOptions {
  adminAuth: EntraAdminAuthOptions;
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  upload: UploadConfig;
  publicUrl?: URL;
  verifyAccessToken?: EntraAccessTokenVerifier;
}

export default (options: ApiRootOptions) => {
  const adminRouter = express
    .Router()
    .use(createAdminAuth(options.adminAuth, options.verifyAccessToken))
    .get('/session', (request, response) => response.json({ user: response.locals['entraAdmin'] }))
    .use('/events', eventsRouter(options))
    .use('/printers', adminPrintersRouter(options));

  return express
    .Router()
    .get('/healthz', (request, response) => response.json({ status: 'ok' }))
    .use('/printers', uploadRouter(options))
    .use('/printers', printersRouter(options))
    .use('/admin', adminRouter)
};
