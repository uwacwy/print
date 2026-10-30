import type { LiveServerEvents } from '@uwacwy/print-shared';
import type { Namespace } from 'socket.io';
import { handshake, type SocketData } from '../handshake/handshake';
import type { WebSocketOptions } from '../sockets';

/** Management UI: a snapshot of online agents, then every agent and job change. */
export const liveNamespace = (
  namespace: Namespace<
    Record<string, never>,
    LiveServerEvents,
    Record<string, never>,
    SocketData
  >,
  { getHub, verify }: WebSocketOptions,
) =>
  namespace
    .use(handshake(verify, 'entraUser'))
    .on('connection', (socket) => {
      const hub = getHub();
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
