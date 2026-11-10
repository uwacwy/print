import { describe, expect, it } from 'vitest';

import { applyLiveEvent } from './printer-live-status';

const status = {
  activeJobs: 0,
  failedJobs: 0,
  lastSeenAt: null,
  online: false,
};

describe('applyLiveEvent', () => {
  it('reads online state from a snapshot', () => {
    expect(
      applyLiveEvent(
        status,
        { onlinePrinterIds: [1, 2], type: 'snapshot' },
        1,
      ).online,
    ).toBe(true);
    expect(
      applyLiveEvent(
        { ...status, online: true },
        { onlinePrinterIds: [2], type: 'snapshot' },
        1,
      ).online,
    ).toBe(false);
  });

  it('keeps the same object when a snapshot changes nothing', () => {
    expect(
      applyLiveEvent(
        status,
        { onlinePrinterIds: [], type: 'snapshot' },
        1,
      ),
    ).toBe(status);
  });

  it('applies agent and job events for this printer', () => {
    const agent = applyLiveEvent(
      status,
      {
        lastSeenAt: '2026-10-29T12:00:00Z',
        online: true,
        printerId: 1,
        type: 'agent',
      },
      1,
    );
    expect(agent).toMatchObject({
      lastSeenAt: '2026-10-29T12:00:00Z',
      online: true,
    });
    expect(
      applyLiveEvent(
        agent,
        {
          activeJobs: 3,
          failedJobs: 1,
          jobId: 'j',
          printerId: 1,
          status: 'queued',
          type: 'job',
        },
        1,
      ),
    ).toMatchObject({
      activeJobs: 3,
      failedJobs: 1,
      online: true,
    });
  });

  it('keeps the last seen time when an event has none', () => {
    const seen = { ...status, lastSeenAt: 'earlier' };
    expect(
      applyLiveEvent(
        seen,
        {
          lastSeenAt: null,
          online: false,
          printerId: 1,
          type: 'agent',
        },
        1,
      ).lastSeenAt,
    ).toBe('earlier');
  });

  it('applies jobs-deleted counts', () => {
    expect(
      applyLiveEvent(
        { ...status, activeJobs: 4 },
        {
          activeJobs: 0,
          count: 4,
          failedJobs: 0,
          printerId: 1,
          type: 'jobs-deleted',
        },
        1,
      ).activeJobs,
    ).toBe(0);
  });

  it('ignores other printers', () => {
    expect(
      applyLiveEvent(
        status,
        {
          lastSeenAt: null,
          online: true,
          printerId: 2,
          type: 'agent',
        },
        1,
      ),
    ).toBe(status);
  });
});
