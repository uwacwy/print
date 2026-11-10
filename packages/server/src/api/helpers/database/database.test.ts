import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  bumpQrEpoch,
  countFailedJobs,
  expireFailedJobs,
  expireStaleJobs,
  getFailedJobIds,
  getJobForPrinter,
  getPrinterById,
  getPrinterByToken,
  getQueuedJobs,
  insertJob,
  markJobsPrinting,
  openDatabase,
  type PrintDatabase,
  purgeFinishedJobs,
  reportJob,
  requeueFailedJobs,
  setPrinterPin,
  tokenHash,
} from './database';

let directory: string;
let db: PrintDatabase;
let printerId: number;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'omega-print-test-'));
  db = openDatabase(directory).db;
  const inserted = db
    .prepare(
      'INSERT INTO printers (slug, name, queue, token_hash) VALUES (?, ?, ?, ?)',
    )
    .run(
      'event-one',
      'Event One',
      'Office',
      tokenHash('agent-token'),
    );
  printerId = Number(inserted.lastInsertRowid);
});

afterEach(() => {
  db.close();
  rmSync(directory, { force: true, recursive: true });
});

function addJob(id: string, owner = printerId): void {
  insertJob(db, {
    copies: 1,
    id,
    original_name: 'document.pdf',
    printer_id: owner,
    submitted_by: null,
    title: 'Test job',
    uploader_ip: '127.0.0.1',
  });
}

describe('upload PINs and token epochs', () => {
  it('starts without a PIN at epoch zero', () => {
    expect(getPrinterById(db, printerId)).toMatchObject({
      pin: null,
      qr_epoch: 0,
    });
  });

  it('stores and clears the PIN', () => {
    expect(setPrinterPin(db, printerId, '012345678')).toBe(true);
    expect(getPrinterById(db, printerId)?.pin).toBe('012345678');
    expect(setPrinterPin(db, printerId, null)).toBe(true);
    expect(getPrinterById(db, printerId)?.pin).toBeNull();
    expect(setPrinterPin(db, 9999, '000000000')).toBe(false);
  });

  it('bumps the epoch to revoke tokens', () => {
    expect(bumpQrEpoch(db, printerId)).toBe(1);
    expect(bumpQrEpoch(db, printerId)).toBe(2);
    expect(bumpQrEpoch(db, 9999)).toBeUndefined();
  });
});

describe('print queue persistence', () => {
  it('stores only a token hash and retrieves the matching printer', () => {
    expect(getPrinterByToken(db, 'agent-token')?.id).toBe(
      printerId,
    );
    expect(getPrinterByToken(db, 'wrong-token')).toBeUndefined();
    expect(
      db
        .prepare('SELECT token_hash FROM printers WHERE id = ?')
        .get(printerId),
    ).toEqual({
      token_hash: tokenHash('agent-token'),
    });
  });

  it('only permits the owning printer to download or acknowledge a job', () => {
    addJob('job-owned');
    const queued = getQueuedJobs(db, printerId);
    const printing = markJobsPrinting(db, printerId, queued);
    expect(printing.map((job) => job.id)).toEqual(['job-owned']);
    expect(
      getJobForPrinter(db, printerId + 1, 'job-owned'),
    ).toBeUndefined();
    expect(
      reportJob(db, printerId + 1, 'job-owned', 'printed'),
    ).toBe(false);
    expect(
      reportJob(db, printerId, 'job-owned', 'printed'),
    ).toBe(true);
  });

  it('expires stale jobs once and removes finished metadata after retention', () => {
    addJob('job-stale');
    db.prepare(
      "UPDATE jobs SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = 'job-stale'",
    ).run();
    expect(
      expireStaleJobs(db, '2020-01-01T00:00:00.000Z'),
    ).toEqual(['job-stale']);
    const finishedAt = (
      db
        .prepare(
          "SELECT finished_at FROM jobs WHERE id = 'job-stale'",
        )
        .get() as {
        finished_at: string;
      }
    ).finished_at;
    expect(
      expireStaleJobs(db, '2020-01-01T00:00:00.000Z'),
    ).toEqual(['job-stale']);
    expect(
      (
        db
          .prepare(
            "SELECT finished_at FROM jobs WHERE id = 'job-stale'",
          )
          .get() as {
          finished_at: string;
        }
      ).finished_at,
    ).toBe(finishedAt);
    expect(
      purgeFinishedJobs(db, '2100-01-01T00:00:00.000Z'),
    ).toEqual(['job-stale']);
    expect(
      getJobForPrinter(db, printerId, 'job-stale'),
    ).toBeUndefined();
  });

  it('requeues failed jobs and expires ones that can no longer print', () => {
    addJob('job-a');
    addJob('job-b');
    addJob('job-c');
    markJobsPrinting(
      db,
      printerId,
      getQueuedJobs(db, printerId),
    );
    reportJob(db, printerId, 'job-a', 'failed', 'jammed');
    reportJob(db, printerId, 'job-b', 'failed', 'offline');
    reportJob(db, printerId, 'job-c', 'printed');
    expect(countFailedJobs(db).get(printerId)).toBe(2);
    expect(getFailedJobIds(db, printerId)).toEqual([
      'job-a',
      'job-b',
    ]);

    expect(
      requeueFailedJobs(db, printerId + 1, ['job-a']),
    ).toEqual([]);
    expect(
      requeueFailedJobs(db, printerId, ['job-a', 'job-c']),
    ).toEqual(['job-a']);
    expect(
      getJobForPrinter(db, printerId, 'job-a'),
    ).toMatchObject({
      error: null,
      finished_at: null,
      status: 'queued',
    });

    expireFailedJobs(db, printerId, ['job-b']);
    expect(
      getJobForPrinter(db, printerId, 'job-b'),
    ).toMatchObject({
      error: 'offline',
      status: 'expired',
    });
    expect(countFailedJobs(db).get(printerId)).toBeUndefined();
  });

  it('expires failed jobs after the TTL but keeps their error', () => {
    addJob('job-failed');
    markJobsPrinting(
      db,
      printerId,
      getQueuedJobs(db, printerId),
    );
    reportJob(db, printerId, 'job-failed', 'failed', 'jammed');
    db.prepare(
      "UPDATE jobs SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = 'job-failed'",
    ).run();
    expect(
      expireStaleJobs(db, '2020-01-01T00:00:00.000Z'),
    ).toEqual(['job-failed']);
    expect(
      getJobForPrinter(db, printerId, 'job-failed'),
    ).toMatchObject({ error: 'jammed', status: 'expired' });
  });
});
