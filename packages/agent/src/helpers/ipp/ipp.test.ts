import ipp from 'ipp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chooseDocumentFormat,
  getSupportedDocumentFormats,
  printDocument,
  validateIppPrinterUri,
} from './ipp';

vi.mock('ipp', () => ({ default: { Printer: vi.fn() } }));

const printer = {
  execute: vi.fn(),
  url: {} as { signal?: AbortSignal },
};

beforeEach(() => {
  printer.execute.mockReset();
  vi.mocked(ipp.Printer).mockReset();
  vi.mocked(ipp.Printer).mockReturnValue(printer);
});

describe('IPP printing', () => {
  it('validates IPP printer URIs', () => {
    expect(
      validateIppPrinterUri('ipp://printer.local:631/ipp/print')
        .protocol,
    ).toBe('ipp:');
    expect(
      validateIppPrinterUri('ipps://printer.local/ipp/print')
        .protocol,
    ).toBe('ipps:');
    expect(
      validateIppPrinterUri('http://printer.local/ipp/print')
        .protocol,
    ).toBe('http:');
    expect(
      validateIppPrinterUri('https://printer.local/ipp/print')
        .protocol,
    ).toBe('https:');
    expect(() =>
      validateIppPrinterUri(
        'ipp://user:password@printer.local/ipp/print',
      ),
    ).toThrow(/embedded credentials/);
    expect(() =>
      validateIppPrinterUri('ipp://printer.local'),
    ).toThrow(/printer endpoint/);
  });

  it('reads supported document formats and prefers native PDF', async () => {
    printer.execute.mockImplementation(
      (_operation, _message, callback) =>
        callback(null, {
          'printer-attributes-tag': {
            'document-format-supported': [
              'application/PCLm',
              'application/pdf',
            ],
          },
          statusCode: 'successful-ok',
        }),
    );
    const uri = new URL('ipp://printer.local:631/ipp/print');
    const formats = await getSupportedDocumentFormats(uri);

    expect(formats).toEqual([
      'application/PCLm',
      'application/pdf',
    ]);
    expect(chooseDocumentFormat(formats)).toBe(
      'application/pdf',
    );
    expect(printer.execute).toHaveBeenCalledWith(
      'Get-Printer-Attributes',
      {
        'operation-attributes-tag': {
          'requested-attributes': ['document-format-supported'],
          'requesting-user-name': 'omega-print-agent',
        },
      },
      expect.any(Function),
    );
  });

  it('chooses PCLm when the printer does not advertise PDF', () => {
    expect(
      chooseDocumentFormat(['image/urf', 'application/PCLm']),
    ).toBe('application/PCLm');
    expect(() => chooseDocumentFormat(['image/urf'])).toThrow(
      /does not advertise application\/pdf or application\/PCLm/,
    );
  });

  it('submits PDF bytes using the negotiated IPP document format', async () => {
    const pdf = Buffer.from('%PDF-test');
    printer.execute.mockImplementation(
      (_operation, _message, callback) =>
        callback(null, { statusCode: 'successful-ok' }),
    );

    await printDocument(
      new URL('ipp://printer.local:631/ipp/print'),
      pdf,
      { title: 'Tax document' },
      'application/PCLm',
    );

    expect(ipp.Printer).toHaveBeenCalledWith(
      'ipp://printer.local:631/ipp/print',
      {
        uri: 'ipp://printer.local:631/ipp/print',
        version: '2.0',
      },
    );
    expect(printer.url.signal).toBeInstanceOf(AbortSignal);
    expect(printer.execute).toHaveBeenCalledWith(
      'Print-Job',
      {
        data: pdf,
        'operation-attributes-tag': {
          'document-format': 'application/PCLm',
          'job-name': 'Tax document',
          'requesting-user-name': 'omega-print-agent',
        },
      },
      expect.any(Function),
    );
  });

  it('rejects unsuccessful IPP status responses', async () => {
    printer.execute.mockImplementation(
      (_operation, _message, callback) =>
        callback(null, {
          statusCode:
            'client-error-document-format-not-supported',
        }),
    );
    await expect(
      printDocument(
        new URL('ipp://printer.local:631/ipp/print'),
        Buffer.from('%PDF-test'),
        {
          title: 'Test',
        },
        'application/pdf',
      ),
    ).rejects.toThrow(
      /client-error-document-format-not-supported/,
    );
  });
});
