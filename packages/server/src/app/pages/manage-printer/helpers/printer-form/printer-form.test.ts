import { PRINTER_SLUG_PATTERN } from '@uwacwy/print-shared';
import { describe, expect, it } from 'vitest';

import {
  emptyPrinterModel,
  printerPageTitle,
  toPrinterModel,
} from './printer-form';

describe('printer form helpers', () => {
  it('accepts lowercase slugs with inner hyphens only', () => {
    expect(PRINTER_SLUG_PATTERN.test('front-office-2')).toBe(
      true,
    );
    expect(PRINTER_SLUG_PATTERN.test('Front')).toBe(false);
    expect(PRINTER_SLUG_PATTERN.test('-front')).toBe(false);
    expect(PRINTER_SLUG_PATTERN.test('front-')).toBe(false);
  });

  it('maps a summary to the editable fields', () => {
    expect(
      toPrinterModel({
        activeJobs: 2,
        coverPage: true,
        failedJobs: 0,
        id: 1,
        lastSeenAt: null,
        name: 'N',
        online: true,
        pin: null,
        qrEpoch: 0,
        queue: 'cups://Q',
        slug: 's',
      }),
    ).toEqual({
      coverPage: true,
      name: 'N',
      queue: 'cups://Q',
      slug: 's',
    });
    expect(emptyPrinterModel().name).toBe('');
  });

  it('titles the page after the name', () => {
    expect(printerPageTitle('Front')).toBe('Manage Front');
    expect(printerPageTitle('')).toBe('Manage Printer');
  });
});
