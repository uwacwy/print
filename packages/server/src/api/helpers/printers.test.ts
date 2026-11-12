import { describe, expect, it } from 'vitest';

import type { PrinterRow } from './database/database';

import { printerView } from './printers';

describe('printerView', () => {
  const printer: PrinterRow = {
    cover_page: 0,
    id: 7,
    last_seen_at: '2026-11-10T00:00:00.000Z',
    name: 'Front office',
    pin: '111222333',
    qr_epoch: 0,
    queue: 'Front',
    slug: 'front-office',
    token_created_at: '',
    token_hash: '',
  };
  const stats = () => ({
    activeJobs: 1,
    failedJobs: 2,
    online: true,
  });

  it('shows the PIN only to signed-in users', () => {
    expect(
      printerView(
        { id: 'user', kind: 'entraUser', roles: [] },
        printer,
        stats,
      ),
    ).toMatchObject({ pin: '111-222-333' });
  });

  it('gives applications status without the PIN', () => {
    const view = printerView(
      {
        clientId: 'windmill',
        id: 'sp',
        kind: 'entraApp',
        roles: ['Printer.Read'],
      },
      printer,
      stats,
    );
    expect(view).toEqual({
      activeJobs: 1,
      coverPage: false,
      failedJobs: 2,
      lastSeenAt: '2026-11-10T00:00:00.000Z',
      name: 'Front office',
      online: true,
      pinEnabled: true,
      slug: 'front-office',
    });
    expect(JSON.stringify(view)).not.toContain('111');
  });

  it('gives everyone else public fields', () => {
    expect(printerView(undefined, printer, stats)).toEqual({
      coverPage: false,
      name: 'Front office',
      slug: 'front-office',
    });
  });
});
