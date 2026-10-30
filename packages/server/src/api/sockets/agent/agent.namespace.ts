import type {
  AgentClientEvents,
  AgentServerEvents,
} from '@uwacwy/print-shared';
import type { Namespace } from 'socket.io';
import { handshake, type SocketData } from '../handshake/handshake';
import type { WebSocketOptions } from '../sockets';

/** Print agents: one live socket per printer, fed by the hub. */
export const agentNamespace = (
  namespace: Namespace<
    AgentClientEvents,
    AgentServerEvents,
    Record<string, never>,
    SocketData
  >,
  { getHub, verify }: WebSocketOptions,
) =>
  namespace
    .use(handshake(verify, 'agentToken'))
    .on('connection', (socket) => {
      const { principal } = socket.data;
      if (principal.kind === 'agent') {
        getHub().connect(socket, principal.printer);
      } else {
        socket.disconnect(true);
      }
    });
