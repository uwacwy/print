import {
  AngularNodeAppEngine,
  AngularNodeAppEngineOptions,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { $, createLogger } from '@uwacwy/print-shared';
import express from 'express';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { isMainThread, workerData } from 'node:worker_threads';
import { Subject } from 'rxjs';

import type {
  DevSockets,
  PrintServerEvent,
  PrintServerEvents,
  ServerGlobals,
} from './api/types';

import apiRoot from './api';
import { openAccessLog } from './api/helpers/access-log/access-log';
import { ensurePublicDir } from './api/helpers/public-dir/public-dir';
import {
  loadLocalEnvFile,
  loadServerConfig,
  readServerVersion,
} from './api/helpers/server-config/server-config';
import { createAuthenticate } from './api/middleware/auth/passport/passport';
import installRouter from './api/routers/install/install.router';
import {
  attachWebSockets,
  type WebSocketOptions,
} from './api/sockets/sockets';
import {
  getPrintRuntime,
  shutdownPrintRuntime,
  startJobCleanup,
} from './realtime/runtime';

const { app: appLog } = createLogger('app');

const {
  config: $config,
  express: $express,
  ng: $ng,
  nodeHttp: $nodeHttp,
} = appLog.create('config', 'node http', 'ng', 'express');

const { paths: $paths } = $config.create('paths');

const browserDistFolder = join(
  import.meta.dirname,
  '../browser',
);

$paths.info('browserDistFolder', browserDistFolder);

// Angular's build imports this module in worker threads to extract and prerender
// routes. Those never serve API requests, so they must not require deployment secrets.
const angularBuildWorker =
  !isMainThread &&
  typeof (workerData as null | { outputMode?: unknown })
    ?.outputMode === 'string';

$ng.info(angularBuildWorker ? 'running as worker' : 'main');

$config.info('loading env');
loadLocalEnvFile();

$config.info('loading config');
const config = loadServerConfig(
  angularBuildWorker && !process.env['UPLOAD_TOKEN_SECRET']
    ? {
        ...process.env,
        UPLOAD_TOKEN_SECRET:
          randomBytes(32).toString('base64url'),
      }
    : process.env,
);
if (config.siteUrl && !config.enrollment.serverUrl) {
  $config.warn(
    `SITE_URL ${config.siteUrl.origin} is not https, so printer enrollment and agent install commands are disabled.`,
  );
}
// Survives `ng serve` re-evaluations of this module; see realtime/runtime.ts.
const runtime = getPrintRuntime(config);
const getHub = () => runtime.hub;
startJobCleanup(runtime, config);
const { verify } = createAuthenticate({
  db: runtime.db,
  entra: config.entra,
});

$express.info('setting up app');
const app = express();
const angularAppOptions: AngularNodeAppEngineOptions = {};
if (config.trustProxy) {
  angularAppOptions.trustProxyHeaders = true;
}

$config.info(
  'trustProxy',
  [config.trustProxy]
    .flatMap((x) => (Array.isArray(x) ? x : []))
    .join(', '),
);

app.set('trust proxy', config.trustProxy);

// Registered first so every response is logged, including static files and errors.
const accessLog =
  config.accessLog && !angularBuildWorker
    ? openAccessLog(config.accessLog)
    : undefined;
if (accessLog) {
  $paths.info('accessLog', config.accessLog!.dir);
  $express.info('using access log', accessLog.dir);
  app.use(accessLog.middleware);
}

// Print links carry upload tokens in the query string; never leak them to other sites.
app.use((_request, response, next) => {
  response.set('Referrer-Policy', 'same-origin');
  next();
});

// Operator files from ${DATA_DIR}/public come first, so they replace the web app's own (e.g. logo.svg).
const publicDir = ensurePublicDir(config.dataDir);

if (publicDir) {
  $express.info('using static', publicDir);

  app.use(
    express.static(publicDir, {
      index: false,
      maxAge: '1y',
      redirect: false,
    }),
  );
}

/**
 * Serve static files from /browser
 */
$express.info('using static', browserDistFolder);
app.use(
  express.static(browserDistFolder, {
    index: false,
    maxAge: '1y',
    redirect: false,
  }),
);

app.use(express.json({ limit: '32kb' }));

app.use(
  $.api.pattern,
  apiRoot({
    client: config.client,
    db: runtime.db,
    enrollment: config.enrollment,
    entra: config.entra,
    getHub,
    jobsDir: runtime.jobsDir,
    logo: {
      alt: config.logoAlt,
      dirs: publicDir
        ? [publicDir, browserDistFolder]
        : [browserDistFolder],
    },
    siteUrl: config.siteUrl,
    upload: config.upload,
  }),
);

app.use(
  installRouter({
    agentVersion: readServerVersion(
      join(import.meta.dirname, '../../package.json'),
    ),
    enrollment: config.enrollment,
    upload: config.upload,
  }),
);

$ng.info('initializing app engine');
const angularApp = new AngularNodeAppEngine({
  ...angularAppOptions,
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response
        ? writeResponseToNodeResponse(response, res)
        : next(),
    )
    .catch(next);
});

const SERVER_GLOBALS_KEY = Symbol.for('@uwacwy/print-server');
const globals = ((globalThis as Record<symbol, unknown>)[
  SERVER_GLOBALS_KEY
] ??= {}) as ServerGlobals;

const eventBus = (globals.eventBus ??=
  new Subject<PrintServerEvent>());

const events: PrintServerEvents = {
  events$: eventBus.asObservable(),
  next: (event) => eventBus.next(event),
};

const socketOptions: WebSocketOptions = {
  events,
  getHub,
  verify,
};

const listen = (
  server: http.Server,
  port: number,
  host?: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    server.once('error', fail);
    server.listen(port, host, () => {
      server.off('error', fail);
      resolve();
    });
  });

function formatAddressInfo(
  address: AddressInfo | null | string,
) {
  if (!address) {
    return '';
  }
  if (typeof address === 'string') {
    return address;
  }
  if (address.family === 'IPv6') {
    return `[${address.address}]:${address.port}`;
  }
  return `${address.address}:${address.port}`;
}

const { websockets: $websockets } =
  $nodeHttp.create('websockets');

/**
 * `ng serve` owns the HTTP server and never exposes its `upgrade` event, so socket.io listens on a
 * loopback side port that proxy.conf.mjs forwards `/ws` (SOCKET_PATH) to. The listener is created once
 * per process; later evaluations only swap in fresh options and await the same `ready` promise,
 * so this module never finishes loading before sockets are accepting connections.
 */
function startDevServer(port: number): Promise<void> {
  $websockets.info(`starting on port ${port}`);
  const existing = globals.devSockets;
  if (existing && existing.port === port) {
    existing.options = socketOptions;
    return existing.ready;
  }
  if (existing) {
    void existing.io.close();
  }

  const server = http.createServer();
  const devSockets: DevSockets = {
    io: attachWebSockets(server, {
      events,
      getHub: () => devSockets.options.getHub(),
      verify: (...args) => devSockets.options.verify(...args),
    }),
    options: socketOptions,
    port,
    ready: listen(server, port, '127.0.0.1').then(
      () => {
        // Don't keep the dev server's process alive just for this listener.
        const address = server.address();
        server.unref();

        console.log(
          `[WebSockets] Listening on ${formatAddressInfo(address)}`,
        );
      },
      (error: unknown) => {
        if (globals.devSockets === devSockets) {
          globals.devSockets = undefined;
        }
        void devSockets.io.close();
        throw new Error(
          `socket.io dev server could not listen on 127.0.0.1:${port} (SOCKET_DEV_PORT)`,
          { cause: error },
        );
      },
    ),
    server,
  };
  globals.devSockets = devSockets;
  return devSockets.ready;
}

import pkg from '../package.json';

/** Production: pages, the REST API, and socket.io share one HTTP server and port. */
async function startServer(): Promise<void> {
  const server = http.createServer(app);
  const io = attachWebSockets(server, socketOptions);
  await listen(server, config.port);
  $nodeHttp.info(
    `${pkg.name} v${pkg.version} server listening on http://${formatAddressInfo(server.address())}`,
  );

  const shutdown = () => {
    $nodeHttp.info('Shutting down');
    shutdownPrintRuntime();
    // Also closes the HTTP server.
    const serverClosed = new Promise<void>((resolve) => {
      // The returned promise settles before the HTTP server finishes closing; the callback doesn't.
      void io.close(() => resolve());
    });
    void Promise.all([serverClosed, accessLog?.close()]).then(
      () => process.exit(0),
    );
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process
    .once('SIGINT', shutdown)
    .once('SIGTERM', shutdown)
    .once('uncaughtException', (error) => {
      console.error('Uncaught exception', error);
      shutdown();
    });
}

/**
 * Start the server if this module is the main entry point, the `uwacwy-print-server` bin imported it,
 * or it is ran via PM2. Otherwise this is `ng serve` (main thread, socketDevPort set) or a build
 * worker extracting routes (no sockets).
 */
const startedByBin =
  (globalThis as { uwacwyPrintServerMain?: boolean })
    .uwacwyPrintServerMain === true;
if (
  isMainModule(import.meta.url) ||
  startedByBin ||
  process.env['pm_id']
) {
  await startServer();
} else if (isMainThread) {
  await startDevServer(config.port + 1);
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
