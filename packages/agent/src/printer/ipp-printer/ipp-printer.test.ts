import { NEVER } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chooseDocumentFormat,
  getSupportedDocumentFormats,
  printDocument,
} from '../../helpers/ipp/ipp';
import { convertPdfToPclm } from '../../helpers/pdf';
import { IppPrinter } from './ipp-printer';

vi.mock('../../helpers/ipp/ipp', () => ({
  chooseDocumentFormat: vi.fn(),
  getSupportedDocumentFormats: vi.fn(),
  printDocument: vi.fn(),
  validateIppPrinterUri: (value: string) => new URL(value),
}));
vi.mock('../../helpers/pdf', () => ({
  convertPdfToPclm: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const ippPrinter = (conn: string) => new IppPrinter(conn, NEVER);

describe('IppPrinter', () => {
  it('negotiates the format once and converts to PCLm when needed', async () => {
    vi.mocked(getSupportedDocumentFormats).mockResolvedValue([
      'application/PCLm',
    ]);
    vi.mocked(chooseDocumentFormat).mockReturnValue(
      'application/PCLm',
    );
    vi.mocked(convertPdfToPclm).mockResolvedValue(
      Buffer.from('pclm'),
    );
    const printer = ippPrinter(
      'ipp://printer.local:631/ipp/print?maxBytes=4096&quality=normal',
    );
    await printer.ready();
    await printer.print(Buffer.from('%PDF-test'), {
      title: 'Tax',
    });
    expect(getSupportedDocumentFormats).toHaveBeenCalledTimes(1);
    expect(getSupportedDocumentFormats).toHaveBeenCalledWith(
      new URL('ipp://printer.local:631/ipp/print'),
    );
    expect(convertPdfToPclm).toHaveBeenCalledWith(
      Buffer.from('%PDF-test'),
      4096,
    );
    expect(printDocument).toHaveBeenCalledWith(
      expect.any(URL),
      Buffer.from('pclm'),
      { title: 'Tax' },
      'application/PCLm',
      { quality: 'normal', timeoutMs: 120_000 },
    );
  });

  it('skips negotiation when the format is forced and retries failed negotiation', async () => {
    const forced = ippPrinter(
      'ipps://printer.local/ipp/print?format=application/pdf',
    );
    await forced.ready();
    expect(getSupportedDocumentFormats).not.toHaveBeenCalled();

    vi.mocked(getSupportedDocumentFormats)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(['application/pdf']);
    vi.mocked(chooseDocumentFormat).mockReturnValue(
      'application/pdf',
    );
    const negotiated = ippPrinter(
      'ipp://printer.local/ipp/print',
    );
    await expect(negotiated.ready()).rejects.toThrow('offline');
    await expect(negotiated.ready()).resolves.toBeUndefined();
  });

  it.each([
    [
      'ipp://printer.local/ipp/print?dpi=150',
      /dpi.*not supported/,
    ],
    [
      'ipp://printer.local/ipp/print?option_sides=one-sided',
      /not supported/,
    ],
  ])('rejects %s', (conn, message) => {
    expect(() => ippPrinter(conn)).toThrow(message);
  });
});
