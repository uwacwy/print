import { describe, expect, it } from 'vitest';
import {
  addPrinter,
  testEntra,
} from '../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../test-support';

describe('live namespace', () => {
  const { entra, token } = testEntra();
  const api = useApiServer({ entra });
  const adminToken = () =>
    token({ sub: 'admin', scp: 'Printers.Manage' });

  it('streams a snapshot, then agent and job events to managers', async () => {
    await api.start();
    const { id, token: agentToken } = addPrinter(api.db);
    const live = api.openLive(await adminToken());

    await expect(live.next()).resolves.toEqual({
      type: 'snapshot',
      onlinePrinterIds: [],
    });

    await api.connectAgent(agentToken);
    await expect(live.next()).resolves.toMatchObject({
      type: 'agent',
      printerId: id,
      online: true,
    });

    await api.postUpload(await uploadForm());
    await expect(live.next()).resolves.toMatchObject({
      type: 'job',
      printerId: id,
      status: 'queued',
      activeJobs: 1,
      failedJobs: 0,
    });
    await expect(live.next()).resolves.toMatchObject({
      type: 'job',
      printerId: id,
      status: 'printing',
      activeJobs: 1,
      failedJobs: 0,
    });
  });

  it('includes already-connected agents in the snapshot', async () => {
    await api.start();
    const { id, token: agentToken } = addPrinter(api.db);
    await api.connectAgent(agentToken);

    await expect(
      api.openLive(await adminToken()).next(),
    ).resolves.toEqual({ type: 'snapshot', onlinePrinterIds: [id] });
  });

  it('requires a manager token', async () => {
    await api.start();
    await expect(api.openLive().rejected()).resolves.toMatchObject({
      data: { status: 401 },
    });
    const { token: agentToken } = addPrinter(api.db);
    await expect(
      api.openLive(agentToken).rejected(),
    ).resolves.toMatchObject({ data: { status: 401 } });
  });

  it('disconnects managers when the hub is disposed so they resubscribe', async () => {
    await api.start();
    const live = api.openLive(await adminToken());
    await live.next();
    const closed = live.closed();

    api.hub.dispose();

    await expect(closed).resolves.toBe('io server disconnect');
  });
});
