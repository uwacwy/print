import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import apiRoot from './api';
import agentRouter from './api/routers/agent/agent.router';
import { createAuthenticate } from './api/middleware/auth/passport/passport';
import { attachWebSockets } from './api/sockets/sockets';
import {
  ensureDevSockets,
  getPrintRuntime,
  shutdownPrintRuntime,
  startJobCleanup,
} from './realtime/runtime';
import { loadLocalEnvFile, loadServerConfig } from './server-config';

const browserDistFolder = join(import.meta.dirname, '../browser');

loadLocalEnvFile();
const config = loadServerConfig();
// Survives `ng serve` re-evaluations of this module; see realtime/runtime.ts.
const runtime = getPrintRuntime(config);
const getHub = () => runtime.hub;
startJobCleanup(runtime, config);
const { verify } = createAuthenticate({
  db: runtime.db,
  entra: config.entra,
});

const app = express();
const angularApp = new AngularNodeAppEngine();
app.set('trust proxy', config.trustProxy);

// Print links carry upload tokens in the query string; never leak them to other sites.
app.use((_request, response, next) => {
  response.set('Referrer-Policy', 'same-origin');
  next();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use(express.json({ limit: '32kb' }));

app.use(
  '/agent',
  agentRouter({ db: runtime.db, jobsDir: runtime.jobsDir, getHub }),
);

app.use(
  '/api',
  apiRoot({
    db: runtime.db,
    jobsDir: runtime.jobsDir,
    getHub,
    upload: config.upload,
    publicUrl: config.publicUrl,
    entra: config.entra,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * socket.io shares the HTTP server, so production is a single port.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const server = app.listen(config.port, (error) => {
    if (error) {
      throw error;
    }

    console.log(
      `Node Express server listening on http://localhost:${config.port}`,
    );
  });

  const io = attachWebSockets(server, { getHub, verify });

  const shutdown = () => {
    shutdownPrintRuntime();
    // Also closes the HTTP server.
    void io.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} else if (config.socketDevPort) {
  // `ng serve`: the dev server never exposes its `upgrade` event, so socket.io clients connect
  // through the /socket.io entry in proxy.conf.json to this side port instead.
  ensureDevSockets(runtime, config.socketDevPort, { verify }).catch(
    (error: unknown) =>
      console.error('socket.io dev server failed to start', error),
  );
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
