import { NEVER } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { PrinterConstructor } from '../../types';

import { CupsPrinter } from '../../printer/cups-printer/cups-printer';
import { IppPrinter } from '../../printer/ipp-printer/ipp-printer';
import { getSupportedDocumentFormats } from '../ipp/ipp';
import { createPrinter } from './create-printer';

vi.mock('../ipp/ipp', () => ({
  getSupportedDocumentFormats: vi.fn(),
  validateIppPrinterUri: (value: string) => new URL(value),
}));

describe('createPrinter', () => {
  it('constructs every driver from a connection string and a request stream', () => {
    const drivers: PrinterConstructor[] = [
      CupsPrinter,
      IppPrinter,
    ];
    const conns = [
      'cups://Queue',
      'ipp://printer.local/ipp/print',
    ];
    drivers.forEach((Driver, index) =>
      expect(
        new Driver(conns[index]!, NEVER).options.maxBytes,
      ).toBe(100 * 1024 * 1024),
    );
  });

  it('routes cups:// to CUPS without querying IPP', async () => {
    const printer = createPrinter('cups://Queue', NEVER);
    expect(printer).toBeInstanceOf(CupsPrinter);
    await printer.ready();
    expect(getSupportedDocumentFormats).not.toHaveBeenCalled();
  });

  it('routes network URIs to IPP', () => {
    expect(
      createPrinter('ipp://printer.local/ipp/print', NEVER),
    ).toBeInstanceOf(IppPrinter);
  });
});
