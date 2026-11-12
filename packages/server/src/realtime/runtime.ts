import type { Server } from 'node:http';
import type { Server as SocketServer } from 'socket.io';

import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ServerConfig } from '../api/helpers/server-config/server-config';
import type { WebSocketOptions } from '../api/sockets/sockets';

import {
  expireStaleJobs,
  openDatabase,
  type PrintDatabase,
  purgeFinishedJobs,
} from '../api/helpers/database/database';
import { AgentHub } from '../api/sockets/agent-hub/agent-hub';

/**
 * Process-wide state for the print server.
 *
 * `ng serve` re-evaluates server.ts through Vite whenever the server bundle changes. Keeping
 * this state on globalThis stops each reload from reopening SQLite, stacking timers, or
 * dropping connected agents. In production the module is evaluated once, so this is a no-op.
 */
export interface PrintRuntime {
  cleanupTimer?: NodeJS.Timeout;
  readonly dataDir: string;
  readonly db: PrintDatabase;
  devSockets?: {
    io: SocketServer;
    options: Pick<WebSocketOptions, 'verify'>;
    port: number;
    server: Server;
  };
  hub: AgentHub;
  hubSource: string;
  readonly jobsDir: string;
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
    hub: new AgentHub(db),
    hubSource: AgentHub.toString(),
    jobsDir,
  };
  store[RUNTIME_KEY] = runtime;
  return runtime;
}

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

/** (Re)starts the periodic job expiry/purge, replacing any timer from an earlier evaluation. */
export function startJobCleanup(
  runtime: PrintRuntime,
  config: Pick<ServerConfig, 'jobTtlMs' | 'retentionMs'>,
): void {
  if (runtime.cleanupTimer) {
    clearInterval(runtime.cleanupTimer);
  }

  runtime.cleanupTimer = setInterval(() => {
    const now = Date.now();
    const expired = expireStaleJobs(
      runtime.db,
      new Date(now - config.jobTtlMs).toISOString(),
    );
    const removed = purgeFinishedJobs(
      runtime.db,
      new Date(now - config.retentionMs).toISOString(),
    );
    void Promise.all(
      [...expired, ...removed].map((id) =>
        rm(join(runtime.jobsDir, `${id}.pdf`), { force: true }),
      ),
    );
  }, 10 * 60_000);
  runtime.cleanupTimer.unref();
}
