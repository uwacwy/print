import { describe, expect, it } from 'vitest';
import {
  emptyPrinterModel,
  printerPageTitle,
  SLUG_PATTERN,
  toPrinterModel,
} from './printer-form';

describe('printer form helpers', () => {
  it('accepts lowercase slugs with inner hyphens only', () => {
    expect(SLUG_PATTERN.test('front-office-2')).toBe(true);
    expect(SLUG_PATTERN.test('Front')).toBe(false);
    expect(SLUG_PATTERN.test('-front')).toBe(false);
    expect(SLUG_PATTERN.test('front-')).toBe(false);
  });

  it('maps a summary to the editable fields', () => {
    expect(
      toPrinterModel({
        id: 1,
        slug: 's',
        name: 'N',
        queue: 'cups://Q',
        coverPage: true,
        lastSeenAt: null,
        activeJobs: 2,
        failedJobs: 0,
        online: true,
        pin: null,
        qrEpoch: 0,
      }),
    ).toEqual({ slug: 's', name: 'N', queue: 'cups://Q', coverPage: true });
    expect(emptyPrinterModel().name).toBe('');
  });

  it('titles the page after the name', () => {
    expect(printerPageTitle('Front')).toBe('Manage Front');
    expect(printerPageTitle('')).toBe('Manage Printer');
  });
});
