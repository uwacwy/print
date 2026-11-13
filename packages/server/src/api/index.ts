import type { ClientConfig } from '@uwacwy/print-shared';

import { api } from '@uwacwy/print-shared';
import express from 'express';
import { createRouting } from 'ts-routes';

import type { PrintDatabase } from './helpers/database/database';
import type {
  EnrollmentConfig,
  UploadConfig,
} from './helpers/server-config/server-config';
import type { EntraUserOptions } from './middleware/auth/entra-user/entra-user.strategy';
import type { AgentHub } from './sockets/agent-hub/agent-hub';

import { findLogoUrl, siteLogo } from './helpers/logo/logo';
import { DEFAULT_SITE_ORG_NAME } from './helpers/server-config/server-config';
import { createAuthenticate } from './middleware/auth/passport/passport';
import agentRouter from './routers/agent/agent.router';
import printersRouter from './routers/printers/printers.router';
import sessionRouter from './routers/session/session.router';

export interface ApiRootOptions {
  client?: ClientConfig;
  db: PrintDatabase;
  /** Enrollment and install commands; disabled when absent. */
  enrollment?: EnrollmentConfig;
  entra: EntraUserOptions;
  getHub: () => AgentHub;
  jobsDir: string;
  /** Static directories searched on every request for the header logo, most preferred first. */
  logo?: { alt: string; dirs: readonly string[] };
  siteUrl: URL;
  upload: UploadConfig;
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
        printersOnline: options.getHub().onlinePrinterIds()
          .length,
      });
    })
    .get(routes.clientConfig.pattern, (_request, response) => {
      const base =
        options.client ??
          ({
            enrollment: !!options.enrollment?.serverUrl,
            site: {
              organizationName: DEFAULT_SITE_ORG_NAME,
              showAttribution: true,
              title: options.upload.siteTitle,
              url: options.siteUrl.href,
            },
          } satisfies ClientConfig);
      const logo =
        base.site.logo ??
        (options.logo &&
          siteLogo(
            findLogoUrl(options.logo.dirs),
            options.logo.alt,
          ));
      response
        .set('cache-control', 'no-cache')
        .json(
          logo
            ? { ...base, site: { ...base.site, logo } }
            : base,
        );
    })
    .use(routes.agent.pattern, agentRouter(options))
    .use(routes.session.pattern, sessionRouter({ authenticate }))
    .use(
      routes.printers.pattern,
      printersRouter({ ...options, authenticate }),
    );
};
