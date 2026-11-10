import { type PrinterSummary } from '@uwacwy/print-shared';
import { describe, expect, it } from 'vitest';

import {
  applyLiveEventToList,
  liveEventAnnouncement,
  patchPrinter,
  withoutPrinter,
} from './printer-list';

const printer = (id: number, name: string): PrinterSummary => ({
  activeJobs: 0,
  coverPage: false,
  failedJobs: 0,
  id,
  lastSeenAt: null,
  name,
  online: false,
  pin: null,
  qrEpoch: 0,
  queue: 'cups://Q',
  slug: name.toLowerCase(),
});
const printers = [printer(1, 'Front'), printer(2, 'Back')];

describe('printer list helpers', () => {
  it('patches and removes by id', () => {
    expect(
      patchPrinter(printers, 2, { activeJobs: 5 })[1].activeJobs,
    ).toBe(5);
    expect(patchPrinter(printers, 2, { activeJobs: 5 })[0]).toBe(
      printers[0],
    );
    expect(withoutPrinter(printers, 1).map((p) => p.id)).toEqual(
      [2],
    );
  });

  it('applies snapshots to every printer and other events to one', () => {
    expect(
      applyLiveEventToList(printers, {
        onlinePrinterIds: [2],
        type: 'snapshot',
      }).map((p) => p.online),
    ).toEqual([false, true]);
    const next = applyLiveEventToList(printers, {
      lastSeenAt: null,
      online: true,
      printerId: 1,
      type: 'agent',
    });
    expect(next[0].online).toBe(true);
    expect(next[1]).toBe(printers[1]);
  });

  it('announces agent, finished job, and deletion events', () => {
    expect(
      liveEventAnnouncement(printers, {
        lastSeenAt: null,
        online: false,
        printerId: 1,
        type: 'agent',
      }),
    ).toBe('Front agent disconnected.');
    const job = (status: 'failed' | 'printing') =>
      liveEventAnnouncement(printers, {
        activeJobs: 0,
        failedJobs: 0,
        jobId: 'j',
        printerId: 2,
        status,
        type: 'job',
      });
    expect(job('failed')).toBe('A job failed on Back.');
    expect(job('printing')).toBe('');
    expect(
      liveEventAnnouncement(printers, {
        activeJobs: 0,
        count: 1,
        failedJobs: 0,
        printerId: 1,
        type: 'jobs-deleted',
      }),
    ).toBe('1 job deleted on Front.');
  });

  it('stays silent for snapshots and unknown printers', () => {
    expect(
      liveEventAnnouncement(printers, {
        onlinePrinterIds: [],
        type: 'snapshot',
      }),
    ).toBe('');
    expect(
      liveEventAnnouncement(printers, {
        lastSeenAt: null,
        online: true,
        printerId: 9,
        type: 'agent',
      }),
    ).toBe('');
  });
});
