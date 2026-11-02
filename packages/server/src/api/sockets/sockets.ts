import type { Server as HttpServer } from 'node:http';
import {
  AGENT_NAMESPACE,
  LIVE_NAMESPACE,
  SOCKET_PATH,
} from '@uwacwy/print-shared';
import { Server } from 'socket.io';
import type { Authenticate } from '../middleware/auth/passport/passport';
import type { PrintServerEvents } from '../../server';
import type { AgentHub, AgentSocket } from './agent-hub/agent-hub';
import { handshake } from './handshake/handshake';

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

  io.of(AGENT_NAMESPACE)
    .use(handshake(options.verify, 'agentToken'))
    .on('connection', (socket) => {
      const { principal } = socket.data;
      if (principal.kind === 'agent') {
        options
          .getHub()
          .connect(socket as AgentSocket, principal.printer);
      } else {
        socket.disconnect(true);
      }
    });

  io.of(LIVE_NAMESPACE)
    .use(handshake(options.verify, 'entraUser'))
    .on('connection', (socket) => {
      const hub = options.getHub();
      socket.emit('live', {
        type: 'snapshot',
        onlinePrinterIds: hub.onlinePrinterIds(),
      });
      // When the hub is replaced (dev reload) the client reconnects for a fresh snapshot.
      const unsubscribe = hub.subscribe(
        (event) => socket.emit('live', event),
        () => socket.disconnect(true),
      );
      socket.on('disconnect', unsubscribe);
    });

  console.log('[WebSockets] attached');

  return io;
};
