import { describe, expect, it } from 'vitest';
import { applyLiveEvent } from './printer-live-status';

const status = { online: false, activeJobs: 0 };

describe('applyLiveEvent', () => {
  it('reads online state from a snapshot', () => {
    expect(
      applyLiveEvent(
        status,
        { type: 'snapshot', onlinePrinterIds: [1, 2] },
        1,
      ),
    ).toEqual({ online: true, activeJobs: 0 });
    expect(
      applyLiveEvent(
        { ...status, online: true },
        { type: 'snapshot', onlinePrinterIds: [2] },
        1,
      ).online,
    ).toBe(false);
  });

  it('applies agent and job events for this printer', () => {
    const agent = applyLiveEvent(
      status,
      { type: 'agent', printerId: 1, online: true, lastSeenAt: null },
      1,
    );
    expect(agent.online).toBe(true);
    expect(
      applyLiveEvent(
        agent,
        {
          type: 'job',
          printerId: 1,
          jobId: 'j',
          status: 'queued',
          activeJobs: 3,
          failedJobs: 0,
        },
        1,
      ),
    ).toEqual({ online: true, activeJobs: 3 });
  });

  it('ignores other printers', () => {
    expect(
      applyLiveEvent(
        status,
        { type: 'agent', printerId: 2, online: true, lastSeenAt: null },
        1,
      ),
    ).toBe(status);
  });
});
