import { createServer, type Server } from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server as SocketServer } from 'socket.io';
import {
  expireStaleJobs,
  openDatabase,
  purgeFinishedJobs,
  type PrintDatabase,
} from '../api/helpers/database/database';
import type { ServerConfig } from '../api/helpers/server-config/server-config';
import { AgentHub } from '../api/sockets/agent-hub/agent-hub';
import {
  attachWebSockets,
  type WebSocketOptions,
} from '../api/sockets/sockets';

/**
 * Process-wide state for the print server.
 *
 * `ng serve` re-evaluates server.ts through Vite whenever the server bundle changes. Keeping
 * this state on globalThis stops each reload from reopening SQLite, stacking timers, or
 * dropping connected agents. In production the module is evaluated once, so this is a no-op.
 */
export interface PrintRuntime {
  readonly dataDir: string;
  readonly db: PrintDatabase;
  readonly jobsDir: string;
  hub: AgentHub;
  hubSource: string;
  cleanupTimer?: NodeJS.Timeout;
  devSockets?: {
    server: Server;
    io: SocketServer;
    port: number;
    options: Pick<WebSocketOptions, 'verify'>;
  };
}

const RUNTIME_KEY = Symbol.for('uwacwy.print.runtime');
type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_KEY]?: PrintRuntime;
};
const store = globalThis as RuntimeGlobal;

export function getPrintRuntime(
  config: Pick<ServerConfig, 'dataDir'>,
): PrintRuntime {
  const existing = store[RUNTIME_KEY];
  if (existing && existing.dataDir === config.dataDir) {
    // Only replace the hub when its implementation changed; agents reconnect within ~1s.
    const hubSource = AgentHub.toString();
    if (existing.hubSource !== hubSource) {
      existing.hub.dispose();
      existing.hub = new AgentHub(existing.db);
      existing.hubSource = hubSource;
    }
    return existing;
  }
  if (existing) {
    shutdownPrintRuntime();
  }

  const { db, jobsDir } = openDatabase(config.dataDir);
  const runtime: PrintRuntime = {
    dataDir: config.dataDir,
    db,
    jobsDir,
    hub: new AgentHub(db),
    hubSource: AgentHub.toString(),
  };
  store[RUNTIME_KEY] = runtime;
  return runtime;
}

/** (Re)starts the periodic job expiry/purge, replacing any timer from an earlier evaluation. */
export function startJobCleanup(
  runtime: PrintRuntime,
  config: Pick<ServerConfig, 'jobTtlMs' | 'retentionMs'>,
): void {
  if (runtime.cleanupTimer) {
    clearInterval(runtime.cleanupTimer);
  }
  runtime.cleanupTimer = setInterval(async () => {
    const now = Date.now();
    const expired = expireStaleJobs(
      runtime.db,
      new Date(now - config.jobTtlMs).toISOString(),
    );
    const removed = purgeFinishedJobs(
      runtime.db,
      new Date(now - config.retentionMs).toISOString(),
    );
    for (const id of [...expired, ...removed]) {
      await rm(join(runtime.jobsDir, `${id}.pdf`), { force: true });
    }
  }, 10 * 60_000);
  runtime.cleanupTimer.unref();
}

/**
 * Dev only: the Angular dev server owns the HTTP server and never exposes `upgrade`, so
 * socket.io listens on a side port that proxy.conf.mjs forwards `/ws` to.
 * The listener is created once and keeps its sockets across reloads; `verify` is re-pointed
 * on every evaluation, but edits to the namespace code itself need a dev-server restart.
 */
// export async function ensureDevSockets(
//   runtime: PrintRuntime,
//   port: number,
//   options: Pick<WebSocketOptions, 'verify'>,
// ): Promise<void> {
//   if (runtime.devSockets && runtime.devSockets.port !== port) {
//     void runtime.devSockets.io.close();
//     runtime.devSockets = undefined;
//   }
//   if (runtime.devSockets) {
//     runtime.devSockets.options = options;
//     return;
//   }
//   const server = createServer();
//   const devSockets: NonNullable<PrintRuntime['devSockets']> = {
//     server,
//     port,
//     options,
//     io: attachWebSockets(server, {
//       getHub: () => runtime.hub,
//       verify: (...args) => devSockets.options.verify(...args),

//     }),
//   };
//   runtime.devSockets = devSockets;
//   try {
//     await new Promise<void>((resolve, reject) => {
//       server.once('error', reject);
//       server.listen(port, '127.0.0.1', () => {
//         server.off('error', reject);
//         resolve();
//       });
//     });
//   } catch (error) {
//     runtime.devSockets = undefined;
//     void devSockets.io.close();
//     throw error;
//   }
//   server.unref();
//   console.log(
//     `socket.io dev server listening on http://127.0.0.1:${port}`,
//   );
// }

export function shutdownPrintRuntime(): void {
  const runtime = store[RUNTIME_KEY];
  if (!runtime) {
    return;
  }
  store[RUNTIME_KEY] = undefined;
  if (runtime.cleanupTimer) {
    clearInterval(runtime.cleanupTimer);
  }
  runtime.hub.dispose();
  if (runtime.devSockets) {
    void runtime.devSockets.io.close();
  }
  runtime.db.close();
}
