import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { AGENT_WS_PATH } from '@uwacwy/print-shared';
import type { PrinterRow } from '../api/helpers/database/database.js';
import type { AgentHub } from './agent-hub';

export interface AgentGatewayOptions {
  /** Resolved per connection so a hub replaced after a dev reload is picked up. */
  getHub: () => AgentHub;
  authenticate: (token: string) => PrinterRow | undefined;
  /** Destroy upgrade requests for other paths. Leave false when sharing the server (e.g. with Vite HMR). */
  rejectUnknownPaths?: boolean;
}

export function bearerToken(
  header: string | undefined,
): string | undefined {
  return header?.startsWith('Bearer ')
    ? header.slice(7).trim() || undefined
    : undefined;
}

function rejectUpgrade(
  socket: Duplex,
  status: number,
  message: string,
): void {
  socket.end(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
  );
}

/**
 * Attaches the agent WebSocket endpoint to an HTTP server and returns a detach function.
 * Detaching stops accepting new agents; established sockets belong to the hub and stay open.
 */
export function attachAgentGateway(
  server: Server,
  options: AgentGatewayOptions,
): () => void {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 4096,
  });

  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost')
      .pathname;
    if (pathname !== AGENT_WS_PATH) {
      if (options.rejectUnknownPaths) {
        rejectUpgrade(socket, 404, 'Not Found');
      }
      return;
    }
    const token = bearerToken(request.headers.authorization);
    const printer = token ? options.authenticate(token) : undefined;
    if (!printer) {
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      options.getHub().connect(ws, printer),
    );
  };

  server.on('upgrade', onUpgrade);
  return () => {
    server.off('upgrade', onUpgrade);
    wss.close();
  };
}
