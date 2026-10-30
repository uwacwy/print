import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  parseAgentMessage,
  type JobStatus,
  type LiveEvent as SharedLiveEvent,
  type ServerMessage,
} from '@uwacwy/print-shared';
import {
  countActiveJobs,
  getPrinterById,
  getQueuedJobs,
  markJobsPrinting,
  markPrinterSeen,
  resetPrintingJobs,
  type PrintDatabase,
  type PrinterRow,
} from '../lib/database/database.js';

export type LiveEvent = Exclude<SharedLiveEvent, { type: 'snapshot' }>;

export interface AgentHubOptions {
  heartbeatIntervalMs?: number;
}

/**
 * Tracks the single live WebSocket per printer agent and pushes queued jobs to it.
 * Transport-agnostic: callers hand it already-authenticated sockets.
 */
export class AgentHub {
  readonly #db: PrintDatabase;
  readonly #heartbeatIntervalMs: number;
  readonly #agents = new Map<number, WebSocket>();
  readonly #events = new EventEmitter<{ event: [LiveEvent]; dispose: [] }>();

  constructor(db: PrintDatabase, options: AgentHubOptions = {}) {
    this.#db = db;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.#events.setMaxListeners(0);
  }

  connect(socket: WebSocket, printer: PrinterRow): void {
    const previous = this.#agents.get(printer.id);
    if (previous && previous !== socket) previous.close(4001, 'Replaced by newer connection');
    resetPrintingJobs(this.#db, printer.id);
    this.#agents.set(printer.id, socket);
    markPrinterSeen(this.#db, printer.id);
    this.#send(socket, { type: 'hello', printer: { slug: printer.slug, name: printer.name } });
    this.#emitAgent(printer.id, true);

    let alive = true;
    socket.on('pong', () => {
      alive = true;
      markPrinterSeen(this.#db, printer.id);
    });
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, this.#heartbeatIntervalMs);
    heartbeat.unref();

    socket.on('message', (raw) => {
      const message = parseAgentMessage(raw.toString());
      if (message?.type === 'sync') this.dispatch(printer.id);
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearInterval(heartbeat);
      if (this.#agents.get(printer.id) !== socket) return;
      this.#agents.delete(printer.id);
      resetPrintingJobs(this.#db, printer.id);
      this.#emitAgent(printer.id, false);
    });
    this.dispatch(printer.id);
  }

  /** Pushes every queued job for the printer to its agent, if one is connected. */
  dispatch(printerId: number): void {
    const socket = this.#agents.get(printerId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const queued = getQueuedJobs(this.#db, printerId);
    if (!queued.length) return;
    const jobs = markJobsPrinting(this.#db, printerId, queued);
    if (!jobs.length) return;
    this.#send(socket, { type: 'jobs', jobs: jobs.map(({ id, title }) => ({ id, title })) });
    for (const job of jobs) this.publishJob(printerId, job.id, 'printing');
  }

  isOnline(printerId: number): boolean {
    return this.#agents.get(printerId)?.readyState === WebSocket.OPEN;
  }

  onlinePrinterIds(): number[] {
    return [...this.#agents.keys()].filter((id) => this.isOnline(id));
  }

  disconnect(printerId: number, reason: string): void {
    this.#agents.get(printerId)?.close(4002, reason);
  }

  publishJob(printerId: number, jobId: string, status: JobStatus): void {
    const activeJobs = countActiveJobs(this.#db).get(printerId) ?? 0;
    this.#events.emit('event', { type: 'job', printerId, jobId, status, activeJobs });
  }

  publishJobsDeleted(printerId: number, count: number): void {
    const activeJobs = countActiveJobs(this.#db).get(printerId) ?? 0;
    this.#events.emit('event', { type: 'jobs-deleted', printerId, count, activeJobs });
  }

  /** `onDispose` fires when this hub is shut down or replaced, so streams can end and reconnect. */
  subscribe(listener: (event: LiveEvent) => void, onDispose?: () => void): () => void {
    this.#events.on('event', listener);
    if (onDispose) this.#events.once('dispose', onDispose);
    return () => {
      this.#events.off('event', listener);
      if (onDispose) this.#events.off('dispose', onDispose);
    };
  }

  dispose(code = 1001, reason = 'Server shutting down'): void {
    for (const socket of this.#agents.values()) socket.close(code, reason);
    this.#agents.clear();
    this.#events.emit('dispose');
    this.#events.removeAllListeners();
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }

  #emitAgent(printerId: number, online: boolean): void {
    this.#events.emit('event', {
      type: 'agent',
      printerId,
      online,
      lastSeenAt: getPrinterById(this.#db, printerId)?.last_seen_at ?? null,
    });
  }
}
