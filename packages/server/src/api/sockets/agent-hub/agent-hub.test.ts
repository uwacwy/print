import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PrintDatabase } from '../../helpers/database/database';
import { tempDatabase } from '../../../realtime/test-support';
import { AgentHub, type LiveEvent } from './agent-hub';

describe('AgentHub', () => {
  let db: PrintDatabase;
  let cleanup: () => Promise<void>;
  let hub: AgentHub;

  beforeEach(async () => {
    ({ db, cleanup } = await tempDatabase());
    hub = new AgentHub(db);
  });

  afterEach(async () => {
    hub.dispose();
    await cleanup();
  });

  it('reports no agents and ignores dispatches before any connect', () => {
    expect(hub.onlinePrinterIds()).toEqual([]);
    expect(hub.isOnline(1)).toBe(false);
    expect(() => hub.dispatch(1)).not.toThrow();
  });

  it('stops delivering events after unsubscribe', () => {
    const events: LiveEvent[] = [];
    const unsubscribe = hub.subscribe((event) => events.push(event));
    hub.publishJobsDeleted(1, 2);
    unsubscribe();
    hub.publishJobsDeleted(1, 3);
    expect(events).toEqual([
      {
        type: 'jobs-deleted',
        printerId: 1,
        count: 2,
        activeJobs: 0,
      },
    ]);
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
