import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AGENT_WS_PATH } from '@uwacwy/print-shared';
import {
  getPrinterByToken,
  insertJob,
  type PrintDatabase,
} from '../lib/database/database.js';
import { attachAgentGateway } from './agent-gateway';
import { AgentHub, type LiveEvent } from './agent-hub';
import {
  addPrinter,
  closeServer,
  listen,
  tempDatabase,
  TestAgent,
} from './test-support';

function queueJob(db: PrintDatabase, printerId: number, id: string) {
  insertJob(db, {
    id,
    printer_id: printerId,
    title: `Job ${id.slice(0, 4)}`,
    copies: 1,
    original_name: 'doc.pdf',
    submitted_by: null,
    uploader_ip: '127.0.0.1',
  });
}

const JOB_A = '11111111-1111-4111-8111-111111111111';
const JOB_B = '22222222-2222-4222-8222-222222222222';

function jobStatus(db: PrintDatabase, id: string) {
  return (
    db.prepare('SELECT status FROM jobs WHERE id = ?').get(id) as {
      status: string;
    }
  ).status;
}

describe('agent WebSocket gateway', () => {
  let db: PrintDatabase;
  let cleanup: () => Promise<void>;
  let hub: AgentHub;
  let server: Server;
  let url: string;
  let agents: TestAgent[];

  const connect = (token: string) => {
    const agent = new TestAgent(url, token);
    agents.push(agent);
    return agent;
  };

  beforeEach(async () => {
    ({ db, cleanup } = await tempDatabase());
    hub = new AgentHub(db, { heartbeatIntervalMs: 60_000 });
    server = createServer();
    attachAgentGateway(server, {
      getHub: () => hub,
      authenticate: (token) => getPrinterByToken(db, token),
      rejectUnknownPaths: true,
    });
    url = `ws://${await listen(server)}${AGENT_WS_PATH}`;
    agents = [];
  });

  afterEach(async () => {
    for (const agent of agents) {
      agent.socket.terminate();
    }
    hub.dispose();
    await closeServer(server);
    await cleanup();
  });

  it('rejects unauthenticated agents before the handshake', async () => {
    const socket = new WebSocket(url, {
      headers: { authorization: 'Bearer nope' },
    });
    const status = await new Promise<number | undefined>((resolve) =>
      socket.once('unexpected-response', (_request, response) =>
        resolve(response.statusCode),
      ),
    );
    expect(status).toBe(401);
  });

  it('rejects upgrades on other paths', async () => {
    const { token } = addPrinter(db);
    const socket = new WebSocket(
      url.replace(AGENT_WS_PATH, '/other'),
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    const status = await new Promise<number | undefined>((resolve) =>
      socket.once('unexpected-response', (_request, response) =>
        resolve(response.statusCode),
      ),
    );
    expect(status).toBe(404);
  });

  it('greets the agent and immediately pushes queued jobs', async () => {
    const { id, token } = addPrinter(db);
    queueJob(db, id, JOB_A);
    const agent = connect(token);

    await expect(agent.next()).resolves.toEqual({
      type: 'hello',
      printer: { slug: 'front-office', name: 'Front Office' },
    });
    await expect(agent.next()).resolves.toEqual({
      type: 'jobs',
      jobs: [{ id: JOB_A, title: 'Job 1111' }],
    });
    expect(jobStatus(db, JOB_A)).toBe('printing');
    expect(hub.isOnline(id)).toBe(true);
  });

  it('pushes jobs dispatched while the agent is connected', async () => {
    const { id, token } = addPrinter(db);
    const agent = connect(token);
    await agent.next();

    queueJob(db, id, JOB_B);
    hub.dispatch(id);

    await expect(agent.next()).resolves.toMatchObject({
      type: 'jobs',
      jobs: [{ id: JOB_B }],
    });
  });

  it('dispatches on agent sync messages', async () => {
    const { id, token } = addPrinter(db);
    const agent = connect(token);
    await agent.next();

    queueJob(db, id, JOB_A);
    agent.socket.send(JSON.stringify({ type: 'sync' }));

    await expect(agent.next()).resolves.toMatchObject({
      type: 'jobs',
      jobs: [{ id: JOB_A }],
    });
  });

  it('replaces an older connection and requeues in-flight jobs on disconnect', async () => {
    const { id, token } = addPrinter(db);
    const events: LiveEvent[] = [];
    hub.subscribe((event) => events.push(event));
    queueJob(db, id, JOB_A);
    const first = connect(token);
    await first.next();
    await first.next();
    const firstClosed = first.closed();

    const second = connect(token);
    await expect(firstClosed).resolves.toMatchObject({ code: 4001 });
    await second.next();
    await expect(second.next()).resolves.toMatchObject({
      type: 'jobs',
      jobs: [{ id: JOB_A }],
    });

    const secondClosed = second.closed();
    second.socket.close();
    await secondClosed;
    await expect.poll(() => hub.isOnline(id)).toBe(false);
    expect(jobStatus(db, JOB_A)).toBe('queued');
    expect(
      events
        .filter((event) => event.type === 'agent')
        .map((event) => event.online),
    ).toEqual([true, true, false]);
  });

  it('ends live-event subscriptions when the hub is disposed', () => {
    let disposed = false;
    hub.subscribe(
      () => undefined,
      () => (disposed = true),
    );
    hub.dispose();
    expect(disposed).toBe(true);
  });
});
