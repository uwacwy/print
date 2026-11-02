import { describe, expect, it } from 'vitest';
import {
  acceptsMimeType,
  DEFAULT_PRINTER_OPTIONS,
  parsePrinterConnection,
} from './printer-options.js';

describe('parsePrinterConnection', () => {
  it('applies defaults and strips the query from the destination', () => {
    const { uri, options } = parsePrinterConnection(
      'ipp://printer.local/ipp/print?timeout=3000',
      ['timeout'],
    );
    expect(uri.href).toBe('ipp://printer.local/ipp/print');
    expect(options).toEqual({
      ...DEFAULT_PRINTER_OPTIONS,
      timeoutMs: 3000,
    });
  });

  it('lets the query override driver defaults', () => {
    expect(
      parsePrinterConnection(
        'cups://Queue?quality=normal',
        ['quality'],
        {
          quality: 'draft',
        },
      ).options.quality,
    ).toBe('normal');
  });

  it.each([
    ['cups://Queue?colour=yes', /"colour" is not supported/],
    ['cups://Queue?quality=best', /quality must be one of/],
    ['cups://Queue?maxBytes=12', /maxBytes must be an integer/],
    ['cups://Queue?timeout=1.5', /timeout must be an integer/],
    ['cups://Queue?mimeTypes=pdf', /mimeTypes must be/],
    ['cups://Queue?quality=draft&quality=high', /repeated/],
    ['not a url', /valid URL/],
  ])('rejects %s', (conn, message) => {
    expect(() =>
      parsePrinterConnection(conn, [
        'maxBytes',
        'mimeTypes',
        'quality',
        'timeout',
      ]),
    ).toThrow(message);
  });
});

describe('acceptsMimeType', () => {
  it('matches media types case-insensitively, ignoring parameters', () => {
    const options = { mimeTypes: ['application/pdf'] };
    expect(acceptsMimeType(options, 'Application/PDF; q=1')).toBe(
      true,
    );
    expect(acceptsMimeType(options, 'image/png')).toBe(false);
    expect(acceptsMimeType(options, null)).toBe(false);
  });
});
