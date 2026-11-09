import { describe, expect, it } from 'vitest';
import type { PrinterSummary } from '../../../../services/printer/printer.service';
import {
  applyLiveEventToList,
  liveEventAnnouncement,
  patchPrinter,
  withoutPrinter,
} from './printer-list';

const printer = (id: number, name: string): PrinterSummary => ({
  id,
  slug: name.toLowerCase(),
  name,
  queue: 'cups://Q',
  coverPage: false,
  lastSeenAt: null,
  activeJobs: 0,
  failedJobs: 0,
  online: false,
  pin: null,
  qrEpoch: 0,
});
const printers = [printer(1, 'Front'), printer(2, 'Back')];

describe('printer list helpers', () => {
  it('patches and removes by id', () => {
    expect(patchPrinter(printers, 2, { activeJobs: 5 })[1].activeJobs).toBe(
      5,
    );
    expect(patchPrinter(printers, 2, { activeJobs: 5 })[0]).toBe(
      printers[0],
    );
    expect(withoutPrinter(printers, 1).map((p) => p.id)).toEqual([2]);
  });

  it('applies snapshots to every printer and other events to one', () => {
    expect(
      applyLiveEventToList(printers, {
        type: 'snapshot',
        onlinePrinterIds: [2],
      }).map((p) => p.online),
    ).toEqual([false, true]);
    const next = applyLiveEventToList(printers, {
      type: 'agent',
      printerId: 1,
      online: true,
      lastSeenAt: null,
    });
    expect(next[0].online).toBe(true);
    expect(next[1]).toBe(printers[1]);
  });

  it('announces agent, finished job, and deletion events', () => {
    expect(
      liveEventAnnouncement(printers, {
        type: 'agent',
        printerId: 1,
        online: false,
        lastSeenAt: null,
      }),
    ).toBe('Front agent disconnected.');
    const job = (status: 'printing' | 'failed') =>
      liveEventAnnouncement(printers, {
        type: 'job',
        printerId: 2,
        jobId: 'j',
        status,
        activeJobs: 0,
        failedJobs: 0,
      });
    expect(job('failed')).toBe('A job failed on Back.');
    expect(job('printing')).toBe('');
    expect(
      liveEventAnnouncement(printers, {
        type: 'jobs-deleted',
        printerId: 1,
        count: 1,
        activeJobs: 0,
        failedJobs: 0,
      }),
    ).toBe('1 job deleted on Front.');
  });

  it('stays silent for snapshots and unknown printers', () => {
    expect(
      liveEventAnnouncement(printers, {
        type: 'snapshot',
        onlinePrinterIds: [],
      }),
    ).toBe('');
    expect(
      liveEventAnnouncement(printers, {
        type: 'agent',
        printerId: 9,
        online: true,
        lastSeenAt: null,
      }),
    ).toBe('');
  });
});
