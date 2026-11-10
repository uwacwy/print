import type { Server as HttpServer } from 'node:http';
import {
  AGENT_NAMESPACE,
  LIVE_NAMESPACE,
  SOCKET_PATH,
} from '@uwacwy/print-shared';
import { Server } from 'socket.io';
import type { Authenticate } from '../middleware/auth/passport/passport';
import type { PrintServerEvents } from '../types';
import type { AgentHub } from './agent-hub/agent-hub';
import {
  agentNamespace,
  type AgentNamespace,
} from './agent/agent.namespace';
import {
  liveNamespace,
  type LiveNamespace,
} from './live/live.namespace';

export interface WebSocketOptions {
  getHub: () => AgentHub;
  verify: Authenticate['verify'];
  events: PrintServerEvents;
}

/**
 * Binds socket.io to the HTTP server at `SOCKET_PATH`:
 * - `/agent`: print agents (`agentToken`) receive `hello` and `jobs`, and send `sync`.
 * - `/live`: the management UI (`entraUser`) receives `live` agent/job events.
 */
export const attachWebSockets = (
  server: HttpServer,
  options: WebSocketOptions,
): Server => {
  const io = new Server(server, {
    path: SOCKET_PATH,
    serveClient: false,
    // Clients only send tiny events; job files travel over HTTP.
    maxHttpBufferSize: 16 * 1024,
  });
  io.of('/').use((_socket, next) =>
    next(new Error('Invalid namespace')),
  );

  // socket.io types events per server, not per namespace.
  agentNamespace(io.of(AGENT_NAMESPACE) as AgentNamespace, options);
  liveNamespace(io.of(LIVE_NAMESPACE) as LiveNamespace, options);

  console.log('[WebSockets] attached');

  return io;
};
