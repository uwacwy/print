import { describe, expect, it } from 'vitest';

import {
  jobsDeletedNotice,
  qrSheetNotice,
  retriedNotice,
} from './printer-messages';

describe('printer messages', () => {
  it('words the QR sheet result by agent state', () => {
    expect(qrSheetNotice('Front', true)).toBe(
      'QR sheet sent to Front.',
    );
    expect(qrSheetNotice('Front', false)).toContain(
      'QR sheet queued',
    );
  });

  it('pluralizes job counts', () => {
    expect(retriedNotice('Front', 1)).toBe(
      'Retried 1 job for Front.',
    );
    expect(retriedNotice('Front', 2)).toBe(
      'Retried 2 jobs for Front.',
    );
    expect(retriedNotice('Front', 0)).toContain(
      'could be retried',
    );
    expect(jobsDeletedNotice('Front', 0)).toBe(
      'Deleted 0 jobs for Front.',
    );
  });
});
