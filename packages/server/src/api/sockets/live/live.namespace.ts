import type { LiveServerEvents } from '@uwacwy/print-shared';
import type { Namespace } from 'socket.io';

import type { WebSocketOptions } from '../sockets';

import {
  handshake,
  type SocketData,
} from '../handshake/handshake';

export type LiveNamespace = Namespace<
  Record<string, never>,
  LiveServerEvents,
  Record<string, never>,
  SocketData
>;

/** Management UI: a snapshot of online agents, then every agent and job change. */
export const liveNamespace = (
  namespace: LiveNamespace,
  { getHub, verify }: WebSocketOptions,
) =>
  namespace
    .use(handshake(verify, 'entraUser'))
    .on('connection', (socket) => {
      const hub = getHub();
      socket.emit('live', {
        onlinePrinterIds: hub.onlinePrinterIds(),
        type: 'snapshot',
      });
      // When the hub is replaced (dev reload) the client reconnects for a fresh snapshot.
      const unsubscribe = hub.subscribe(
        (event) => socket.emit('live', event),
        () => socket.disconnect(true),
      );
      socket.on('disconnect', unsubscribe);
    });
