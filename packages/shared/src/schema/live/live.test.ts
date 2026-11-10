import { describe, expect, it } from 'vitest';

import { LiveEvent } from './live';

describe('LiveEvent', () => {
  it('parses each event type', () => {
    for (const event of [
      {
        activeJobs: 1,
        failedJobs: 0,
        jobId: 'j',
        printerId: 1,
        status: 'queued',
        type: 'job',
      },
      {
        activeJobs: 0,
        count: 2,
        failedJobs: 0,
        printerId: 1,
        type: 'jobs-deleted',
      },
      {
        lastSeenAt: null,
        online: true,
        printerId: 1,
        type: 'agent',
      },
      { onlinePrinterIds: [1], type: 'snapshot' },
    ]) {
      expect(LiveEvent.parse(event)).toEqual(event);
    }
  });

  it('rejects unknown types and bad statuses', () => {
    expect(LiveEvent.safeParse({ type: 'nope' }).success).toBe(
      false,
    );
    expect(
      LiveEvent.safeParse({
        activeJobs: 1,
        failedJobs: 0,
        jobId: 'j',
        printerId: 1,
        status: 'lost',
        type: 'job',
      }).success,
    ).toBe(false);
  });
});
