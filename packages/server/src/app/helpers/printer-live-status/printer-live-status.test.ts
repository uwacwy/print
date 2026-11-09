import { describe, expect, it } from 'vitest';
import { applyLiveEvent } from './printer-live-status';

const status = {
  online: false,
  activeJobs: 0,
  failedJobs: 0,
  lastSeenAt: null,
};

describe('applyLiveEvent', () => {
  it('reads online state from a snapshot', () => {
    expect(
      applyLiveEvent(
        status,
        { type: 'snapshot', onlinePrinterIds: [1, 2] },
        1,
      ).online,
    ).toBe(true);
    expect(
      applyLiveEvent(
        { ...status, online: true },
        { type: 'snapshot', onlinePrinterIds: [2] },
        1,
      ).online,
    ).toBe(false);
  });

  it('keeps the same object when a snapshot changes nothing', () => {
    expect(
      applyLiveEvent(
        status,
        { type: 'snapshot', onlinePrinterIds: [] },
        1,
      ),
    ).toBe(status);
  });

  it('applies agent and job events for this printer', () => {
    const agent = applyLiveEvent(
      status,
      {
        type: 'agent',
        printerId: 1,
        online: true,
        lastSeenAt: '2026-10-29T12:00:00Z',
      },
      1,
    );
    expect(agent).toMatchObject({
      online: true,
      lastSeenAt: '2026-10-29T12:00:00Z',
    });
    expect(
      applyLiveEvent(
        agent,
        {
          type: 'job',
          printerId: 1,
          jobId: 'j',
          status: 'queued',
          activeJobs: 3,
          failedJobs: 1,
        },
        1,
      ),
    ).toMatchObject({ online: true, activeJobs: 3, failedJobs: 1 });
  });

  it('keeps the last seen time when an event has none', () => {
    const seen = { ...status, lastSeenAt: 'earlier' };
    expect(
      applyLiveEvent(
        seen,
        { type: 'agent', printerId: 1, online: false, lastSeenAt: null },
        1,
      ).lastSeenAt,
    ).toBe('earlier');
  });

  it('applies jobs-deleted counts', () => {
    expect(
      applyLiveEvent(
        { ...status, activeJobs: 4 },
        {
          type: 'jobs-deleted',
          printerId: 1,
          count: 4,
          activeJobs: 0,
          failedJobs: 0,
        },
        1,
      ).activeJobs,
    ).toBe(0);
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
