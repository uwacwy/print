import type { Server as HttpServer } from 'node:http';
import {
  AGENT_NAMESPACE,
  LIVE_NAMESPACE,
  SOCKET_PATH,
} from '@uwacwy/print-shared';
import { Server, type Namespace } from 'socket.io';
import type { Authenticate } from '../middleware/auth/passport/passport';
import { agentNamespace } from './agent/agent.namespace';
import type { AgentHub } from './agent-hub/agent-hub';
import { liveNamespace } from './live/live.namespace';

export interface WebSocketOptions {
  getHub: () => AgentHub;
  verify: Authenticate['verify'];
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
  // socket.io types one event map per server; each namespace speaks its own protocol.
  const of = <N extends Namespace>(name: string) =>
    io.of(name) as unknown as N;
  agentNamespace(of(AGENT_NAMESPACE), options);
  liveNamespace(of(LIVE_NAMESPACE), options);
  return io;
};
