import type {
  AgentClientEvents,
  AgentServerEvents,
} from '@uwacwy/print-shared';
import type { Namespace } from 'socket.io';

import type { WebSocketOptions } from '../sockets';

import {
  handshake,
  type SocketData,
} from '../handshake/handshake';

export type AgentNamespace = Namespace<
  AgentClientEvents,
  AgentServerEvents,
  Record<string, never>,
  SocketData
>;

/** Print agents: one live socket per printer, fed by the hub. */
export const agentNamespace = (
  namespace: AgentNamespace,
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
