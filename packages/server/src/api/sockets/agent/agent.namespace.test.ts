import { describe, expect, it } from 'vitest';

import type { LiveEvent } from '../agent-hub/agent-hub';

import { addPrinter } from '../../../realtime/test-support';
import {
  insertJob,
  type PrintDatabase,
} from '../../helpers/database/database';
import { useApiServer } from '../../test-support';

function queueJob(
  db: PrintDatabase,
  printerId: number,
  id: string,
) {
  insertJob(db, {
    copies: 1,
    id,
    original_name: 'doc.pdf',
    printer_id: printerId,
    submitted_by: null,
    title: `Job ${id.slice(0, 4)}`,
    uploader_ip: '127.0.0.1',
  });
}

const JOB_A = '11111111-1111-4111-8111-111111111111';
const JOB_B = '22222222-2222-4222-8222-222222222222';

function jobStatus(db: PrintDatabase, id: string) {
  return (
    db
      .prepare('SELECT status FROM jobs WHERE id = ?')
      .get(id) as {
      status: string;
    }
  ).status;
}

describe('agent namespace', () => {
  const api = useApiServer();

  it('rejects agents without a valid token during the handshake', async () => {
    await api.start();
    await expect(api.openAgent().rejected()).resolves.toEqual({
      data: { code: 'agent_token_required', status: 401 },
      message: 'Unauthorized',
    });
    await expect(
      api.openAgent('nope').rejected(),
    ).resolves.toEqual({
      data: { code: 'agent_token_invalid', status: 401 },
      message: 'Unauthorized',
    });
  });

  it('rejects unknown namespaces', async () => {
    await api.start();
    const { token } = addPrinter(api.db);
    for (const namespace of ['/', '/other']) {
      await expect(
        api.openAgent(token, namespace).rejected(),
      ).resolves.toMatchObject({ message: 'Invalid namespace' });
    }
  });

  it('greets the agent and immediately pushes queued jobs', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    queueJob(api.db, id, JOB_A);
    const agent = api.openAgent(token);

    await expect(agent.next()).resolves.toEqual({
      printer: { name: 'Front Office', slug: 'front-office' },
      type: 'hello',
    });
    await expect(agent.next()).resolves.toEqual({
      jobs: [{ id: JOB_A, title: 'Job 1111' }],
      type: 'jobs',
    });
    expect(jobStatus(api.db, JOB_A)).toBe('printing');
    expect(api.hub.isOnline(id)).toBe(true);
  });

  it('pushes jobs dispatched while the agent is connected', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    const agent = await api.connectAgent(token);

    queueJob(api.db, id, JOB_B);
    api.hub.dispatch(id);

    await expect(agent.next()).resolves.toMatchObject({
      jobs: [{ id: JOB_B }],
      type: 'jobs',
    });
  });

  it('dispatches when the agent syncs', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    const agent = await api.connectAgent(token);

    queueJob(api.db, id, JOB_A);
    agent.socket.emit('sync');

    await expect(agent.next()).resolves.toMatchObject({
      jobs: [{ id: JOB_A }],
      type: 'jobs',
    });
  });

  it('replaces an older connection and requeues in-flight jobs on disconnect', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    const events: LiveEvent[] = [];
    api.hub.subscribe((event) => events.push(event));
    queueJob(api.db, id, JOB_A);
    const first = await api.connectAgent(token);
    await first.next();
    const firstClosed = first.closed();

    const second = await api.connectAgent(token);
    await expect(firstClosed).resolves.toBe(
      'io server disconnect',
    );
    await expect(second.next()).resolves.toMatchObject({
      jobs: [{ id: JOB_A }],
      type: 'jobs',
    });

    second.close();
    await expect.poll(() => api.hub.isOnline(id)).toBe(false);
    expect(jobStatus(api.db, JOB_A)).toBe('queued');
    expect(
      events
        .filter((event) => event.type === 'agent')
        .map((event) => event.online),
    ).toEqual([true, true, false]);
  });

  it('drops the agent when the hub disconnects its printer', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    const agent = await api.connectAgent(token);
    const closed = agent.closed();

    api.hub.disconnect(id);

    await expect(closed).resolves.toBe('io server disconnect');
    expect(api.hub.isOnline(id)).toBe(false);
  });
});
