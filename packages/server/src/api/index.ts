import type { ClientConfig } from '@uwacwy/print-shared';
import express from 'express';
import { createRouting } from 'ts-routes';
import { api } from '../shared/routes/api.routes';
import type { PrintDatabase } from './helpers/database/database';
import type {
  EnrollmentConfig,
  UploadConfig,
} from './helpers/server-config/server-config';
import type { EntraUserOptions } from './middleware/auth/entra-user/entra-user.strategy';
import { createAuthenticate } from './middleware/auth/passport/passport';
import agentRouter from './routers/agent/agent.router';
import printersRouter from './routers/printers/printers.router';
import sessionRouter from './routers/session/session.router';
import type { AgentHub } from './sockets/agent-hub/agent-hub';

export interface ApiRootOptions {
  entra: EntraUserOptions;
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  upload: UploadConfig;
  publicUrl: URL;
  /** Enrollment and install commands; disabled when absent. */
  enrollment?: EnrollmentConfig;
  client?: ClientConfig;
}
const routes = createRouting(api);

routes.printers.$slug({ slug: 'test' });
/** `/api`: each segment's router declares the credentials every endpoint accepts. */
export default (options: ApiRootOptions) => {
  const authenticate = createAuthenticate({
    db: options.db,
    entra: options.entra,
    uploadToken: options.upload.access,
  });
  return express
    .Router()
    .get(routes.healthz.pattern, (_request, response) =>
      response.status(200).json({ status: 'ok' }),
    )
    .get(routes.status.pattern, (_request, response) => {
      response.set('cache-control', 'no-store').json({
        printersOnline: options.getHub().onlinePrinterIds().length,
      });
    })
    .get(routes.clientConfig.pattern, (_request, response) => {
      response.set('cache-control', 'no-cache').json(
        options.client ??
          ({
            enrollment: !!options.enrollment?.serverUrl,
            publicUrl: options.publicUrl,
          } satisfies ClientConfig),
      );
    })
    .use(routes.agent.pattern, agentRouter(options))
    .use(routes.session.pattern, sessionRouter({ authenticate }))
    .use(
      routes.printers.pattern,
      printersRouter({ ...options, authenticate }),
    );
};
