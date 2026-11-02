import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import http from 'node:http';
import { isMainThread } from 'node:worker_threads';
import type { Server as SocketServer } from 'socket.io';
import apiRoot from './api';
import agentRouter from './api/routers/agent/agent.router';
import { createAuthenticate } from './api/middleware/auth/passport/passport';
import {
  attachWebSockets,
  type WebSocketOptions,
} from './api/sockets/sockets';
import {
  getPrintRuntime,
  shutdownPrintRuntime,
  startJobCleanup,
} from './realtime/runtime';
import { loadLocalEnvFile, loadServerConfig } from './server-config';
import { Observable, Subject } from 'rxjs';

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

type JobCreatedEvent = {
  type: 'job-created';
};

type PrintServerEvent = JobCreatedEvent;

export type PrintServerEvents = {
  next: (event: PrintServerEvent) => void;
  events$: Observable<PrintServerEvent>;
};

/**
 * Process-wide state that must outlive `ng serve` re-evaluations of this module: the event bus
 * (so subscribers keep receiving events) and the dev socket.io listener.
 */
interface ServerGlobals {
  eventBus?: Subject<PrintServerEvent>;
  devSockets?: DevSockets;
}

interface DevSockets {
  port: number;
  server: http.Server;
  io: SocketServer;
  /** Re-pointed on every evaluation so socket handlers use the latest hub and verifier. */
  options: WebSocketOptions;
  /** Settles once the side port is listening; a rejected listener is discarded and retried. */
  ready: Promise<void>;
}

const SERVER_GLOBALS_KEY = Symbol.for('@uwacwy/print/server');
const globals = ((globalThis as Record<symbol, unknown>)[
  SERVER_GLOBALS_KEY
] ??= {}) as ServerGlobals;

const eventBus = (globals.eventBus ??=
  new Subject<PrintServerEvent>());
const events: PrintServerEvents = {
  next: (event) => eventBus.next(event),
  events$: eventBus.asObservable(),
};

const socketOptions: WebSocketOptions = { getHub, verify, events };

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

/**
 * `ng serve` owns the HTTP server and never exposes its `upgrade` event, so socket.io listens on a
 * loopback side port that proxy.conf.mjs forwards `/ws` (SOCKET_PATH) to. The listener is created once
 * per process; later evaluations only swap in fresh options and await the same `ready` promise,
 * so this module never finishes loading before sockets are accepting connections.
 */
function ensureDevSockets(port: number): Promise<void> {
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
    port,
    server,
    options: socketOptions,
    io: attachWebSockets(server, {
      getHub: () => devSockets.options.getHub(),
      verify: (...args) => devSockets.options.verify(...args),
      events,
    }),
    ready: listen(server, port, '127.0.0.1').then(
      () => {
        // Don't keep the dev server's process alive just for this listener.
        server.unref();
        console.log(
          `socket.io dev server listening on http://127.0.0.1:${port}`,
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
  };
  globals.devSockets = devSockets;
  return devSockets.ready;
}

/** Production: pages, the REST API, and socket.io share one HTTP server and port. */
async function startServer(): Promise<void> {
  const server = http.createServer(app);
  const io = attachWebSockets(server, socketOptions);
  await listen(server, config.port);
  console.log(
    `Node Express server listening on http://localhost:${config.port}`,
  );

  const shutdown = () => {
    console.log('Shutting down');
    shutdownPrintRuntime();
    // Also closes the HTTP server.
    void io.close(() => process.exit(0));
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
 * Start the server if this module is the main entry point, or it is ran via PM2. Otherwise this is
 * `ng serve` (main thread, socketDevPort set) or a build worker extracting routes (no sockets).
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  await startServer();
} else if (isMainThread && config.socketDevPort) {
  await ensureDevSockets(config.socketDevPort);
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
