import express from 'express';
import { HEARTBEAT_INTERVAL_MS, type LiveEvent } from '@uwacwy/print-shared';
import type { AgentHub } from '../realtime/agent-hub';

export interface LiveEventsApiOptions {
  getHub: () => AgentHub;
  heartbeatIntervalMs?: number;
}

/** Server-Sent Events stream of agent and job changes for the admin UI (mount behind admin auth). */
export default ({ getHub, heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS }: LiveEventsApiOptions) =>
  express.Router().get('/', (request, response) => {
    const hub = getHub();
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.flushHeaders();
    request.socket.setKeepAlive(true);
    request.socket.setNoDelay(true);

    const send = (event: LiveEvent) =>
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.write('retry: 3000\n\n');
    send({ type: 'snapshot', onlinePrinterIds: hub.onlinePrinterIds() });

    let stop = () => {};
    const unsubscribe = hub.subscribe(send, () => {
      stop();
      response.end();
    });
    const heartbeat = setInterval(() => response.write(': ping\n\n'), heartbeatIntervalMs);
    heartbeat.unref();
    stop = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.on('close', stop);
    response.on('error', stop);
  });
