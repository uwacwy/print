import type { Server as HttpServer } from 'node:http';
import type { Observable, Subject } from 'rxjs';
import type { Server as SocketServer } from 'socket.io';
import type { WebSocketOptions } from './sockets/sockets';

export type JobCreatedEvent = {
  type: 'job-created';
};

export type PrintServerEvent = JobCreatedEvent;

export type PrintServerEvents = {
  next: (event: PrintServerEvent) => void;
  events$: Observable<PrintServerEvent>;
};

/**
 * Process-wide state that must outlive `ng serve` re-evaluations of this module: the event bus
 * (so subscribers keep receiving events) and the dev socket.io listener.
 */
export interface ServerGlobals {
  eventBus?: Subject<PrintServerEvent>;
  devSockets?: DevSockets;
}

export interface DevSockets {
  port: number;
  server: HttpServer;
  io: SocketServer;
  /** Re-pointed on every evaluation so socket handlers use the latest hub and verifier. */
  options: WebSocketOptions;
  /** Settles once the side port is listening; a rejected listener is discarded and retried. */
  ready: Promise<void>;
}
