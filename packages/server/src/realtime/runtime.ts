import { createServer, type Server } from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  expireStaleJobs,
  getPrinterByToken,
  openDatabase,
  purgeFinishedJobs,
  type PrintDatabase,
} from '../lib/database/database.js';
import type { ServerConfig } from '../server-config';
import { AgentHub } from './agent-hub';
import { attachAgentGateway } from './agent-gateway';

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
  devGateway?: { server: Server; port: number; detach?: () => void };
}

const RUNTIME_KEY = Symbol.for('uwacwy.print.runtime');
type RuntimeGlobal = typeof globalThis & { [RUNTIME_KEY]?: PrintRuntime };
const store = globalThis as RuntimeGlobal;

export function getPrintRuntime(config: Pick<ServerConfig, 'dataDir'>): PrintRuntime {
  const existing = store[RUNTIME_KEY];
  if (existing && existing.dataDir === config.dataDir) {
    // Only replace the hub when its implementation changed; agents reconnect within ~1s.
    const hubSource = AgentHub.toString();
    if (existing.hubSource !== hubSource) {
      existing.hub.dispose(1012, 'Server code reloaded');
      existing.hub = new AgentHub(existing.db);
      existing.hubSource = hubSource;
    }
    return existing;
  }
  if (existing) shutdownPrintRuntime();

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

export function authenticateAgent(runtime: PrintRuntime, token: string) {
  return getPrinterByToken(runtime.db, token);
}

/** (Re)starts the periodic job expiry/purge, replacing any timer from an earlier evaluation. */
export function startJobCleanup(
  runtime: PrintRuntime,
  config: Pick<ServerConfig, 'jobTtlMs' | 'retentionMs'>,
): void {
  if (runtime.cleanupTimer) clearInterval(runtime.cleanupTimer);
  runtime.cleanupTimer = setInterval(async () => {
    const now = Date.now();
    const expired = expireStaleJobs(runtime.db, new Date(now - config.jobTtlMs).toISOString());
    const removed = purgeFinishedJobs(runtime.db, new Date(now - config.retentionMs).toISOString());
    for (const id of [...expired, ...removed])
      await rm(join(runtime.jobsDir, `${id}.pdf`), { force: true });
  }, 10 * 60_000);
  runtime.cleanupTimer.unref();
}

/**
 * Dev only: the Angular dev server owns the HTTP server and never exposes `upgrade`, so the
 * agent WebSocket listens on a side port that proxy.conf.json forwards `/agent/ws` to.
 * The listener is created once; the upgrade handler is re-attached on every evaluation so
 * gateway code edits apply without dropping already-connected agents.
 */
export async function ensureDevAgentGateway(runtime: PrintRuntime, port: number): Promise<void> {
  if (runtime.devGateway && runtime.devGateway.port !== port) {
    runtime.devGateway.detach?.();
    runtime.devGateway.server.close();
    runtime.devGateway = undefined;
  }
  if (!runtime.devGateway) {
    const server = createServer((_request, response) => {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not Found');
    });
    runtime.devGateway = { server, port };
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      runtime.devGateway = undefined;
      throw error;
    }
    server.unref();
    console.log(`Agent WebSocket dev gateway listening on ws://127.0.0.1:${port}`);
  }
  runtime.devGateway.detach?.();
  runtime.devGateway.detach = attachAgentGateway(runtime.devGateway.server, {
    getHub: () => runtime.hub,
    authenticate: (token) => authenticateAgent(runtime, token),
    rejectUnknownPaths: true,
  });
}

export function shutdownPrintRuntime(): void {
  const runtime = store[RUNTIME_KEY];
  if (!runtime) return;
  store[RUNTIME_KEY] = undefined;
  if (runtime.cleanupTimer) clearInterval(runtime.cleanupTimer);
  runtime.hub.dispose();
  if (runtime.devGateway) {
    runtime.devGateway.detach?.();
    runtime.devGateway.server.close();
  }
  runtime.db.close();
}
