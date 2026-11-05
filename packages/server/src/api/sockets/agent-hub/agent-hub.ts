import { EventEmitter } from 'node:events';
import type {
  AgentClientEvents,
  AgentServerEvents,
  JobStatus,
  LiveEvent as SharedLiveEvent,
} from '@uwacwy/print-shared';
import type { Socket } from 'socket.io';
import {
  countActiveJobs,
  countFailedJobs,
  getPrinterById,
  getQueuedJobs,
  markJobsPrinting,
  markPrinterSeen,
  resetPrintingJobs,
  type PrintDatabase,
  type PrinterRow,
} from '../../helpers/database/database';
import type { SocketData } from '../handshake/handshake';

export type LiveEvent = Exclude<
  SharedLiveEvent,
  { type: 'snapshot' }
>;

export type AgentSocket = Socket<
  AgentClientEvents,
  AgentServerEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Tracks the single live socket per printer agent, pushes queued jobs to it, and publishes
 * agent and job changes to live-event subscribers.
 */
export class AgentHub {
  readonly #db: PrintDatabase;
  readonly #agents = new Map<number, AgentSocket>();
  readonly #events = new EventEmitter<{
    event: [LiveEvent];
    dispose: [];
  }>();

  constructor(db: PrintDatabase) {
    this.#db = db;
    this.#events.setMaxListeners(0);
  }

  connect(socket: AgentSocket, printer: PrinterRow): void {
    const previous = this.#agents.get(printer.id);
    // Registered first so the replaced socket's disconnect handler sees it is stale.
    this.#agents.set(printer.id, socket);
    if (previous && previous !== socket) {
      previous.disconnect(true);
    }
    resetPrintingJobs(this.#db, printer.id);
    markPrinterSeen(this.#db, printer.id);
    socket.emit('hello', { slug: printer.slug, name: printer.name });
    this.#emitAgent(printer.id, true);

    // socket.io pings every client; each answered ping proves the agent is alive.
    const onHeartbeat = () => markPrinterSeen(this.#db, printer.id);
    socket.conn.on('heartbeat', onHeartbeat);
    socket.on('sync', () => this.dispatch(printer.id));
    socket.on('disconnect', () => {
      socket.conn.off('heartbeat', onHeartbeat);
      if (this.#agents.get(printer.id) !== socket) {
        return;
      }
      this.#agents.delete(printer.id);
      resetPrintingJobs(this.#db, printer.id);
      this.#emitAgent(printer.id, false);
    });
    this.dispatch(printer.id);
  }

  /** Pushes every queued job for the printer to its agent, if one is connected. */
  dispatch(printerId: number): void {
    const socket = this.#agents.get(printerId);
    if (!socket?.connected) {
      return;
    }
    const queued = getQueuedJobs(this.#db, printerId);
    if (!queued.length) {
      return;
    }
    const jobs = markJobsPrinting(this.#db, printerId, queued);
    if (!jobs.length) {
      return;
    }
    socket.emit(
      'jobs',
      jobs.map(({ id, title }) => ({ id, title })),
    );
    for (const job of jobs) {
      this.publishJob(printerId, job.id, 'printing');
    }
  }

  isOnline(printerId: number): boolean {
    return this.#agents.get(printerId)?.connected === true;
  }

  onlinePrinterIds(): number[] {
    return [...this.#agents.keys()].filter((id) =>
      this.isOnline(id),
    );
  }

  /** Drops the printer's agent, e.g. after its token is rotated or the printer is deleted. */
  disconnect(printerId: number): void {
    this.#agents.get(printerId)?.disconnect(true);
  }

  publishJob(
    printerId: number,
    jobId: string,
    status: JobStatus,
  ): void {
    this.#events.emit('event', {
      type: 'job',
      printerId,
      jobId,
      status,
      ...this.#jobCounts(printerId),
    });
  }

  publishJobsDeleted(printerId: number, count: number): void {
    this.#events.emit('event', {
      type: 'jobs-deleted',
      printerId,
      count,
      ...this.#jobCounts(printerId),
    });
  }

  #jobCounts(printerId: number) {
    return {
      activeJobs: countActiveJobs(this.#db).get(printerId) ?? 0,
      failedJobs: countFailedJobs(this.#db).get(printerId) ?? 0,
    };
  }

  /** `onDispose` fires when this hub is shut down or replaced, so subscribers can follow its successor. */
  subscribe(
    listener: (event: LiveEvent) => void,
    onDispose?: () => void,
  ): () => void {
    this.#events.on('event', listener);
    if (onDispose) {
      this.#events.once('dispose', onDispose);
    }
    return () => {
      this.#events.off('event', listener);
      if (onDispose) {
        this.#events.off('dispose', onDispose);
      }
    };
  }

  /** Disconnects every agent; they reconnect on their own, and in-flight jobs requeue then. */
  dispose(): void {
    const sockets = [...this.#agents.values()];
    this.#agents.clear();
    for (const socket of sockets) {
      socket.disconnect(true);
    }
    this.#events.emit('dispose');
    this.#events.removeAllListeners();
  }

  #emitAgent(printerId: number, online: boolean): void {
    this.#events.emit('event', {
      type: 'agent',
      printerId,
      online,
      lastSeenAt:
        getPrinterById(this.#db, printerId)?.last_seen_at ?? null,
    });
  }
}
