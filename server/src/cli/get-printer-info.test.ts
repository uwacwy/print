import ipp from 'ipp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrinterInfo } from './get-printer-info.js';

vi.mock('ipp', () => ({
  default: {
    Printer: vi.fn(),
    parse: Object.assign(vi.fn(), { handleUnknownTag: vi.fn() }),
  },
}));

const execute = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ipp.Printer).mockImplementation(function (
    this: ipp.Printer,
  ) {
    Object.assign(this, { url: {}, execute });
  });
});

describe('printer:get-info', () => {
  it('requests and returns all advertised attributes without printing', async () => {
    execute.mockImplementation((_operation, _message, callback) =>
      callback(null, {
        statusCode: 'successful-ok',
        'printer-attributes-tag': {
          'document-format-supported': ['application/pdf'],
        },
      }),
    );
    const result = await getPrinterInfo(
      'ipp://printer.local:631/ipp/print',
    );
    expect(result).toEqual({
      uri: 'ipp://printer.local:631/ipp/print',
      statusCode: 'successful-ok',
      capabilities: {
        'document-format-supported': ['application/pdf'],
      },
    });
    expect(execute).toHaveBeenCalledWith(
      'Get-Printer-Attributes',
      {
        'operation-attributes-tag': {
          'requesting-user-name': 'omega-print-admin',
          'requested-attributes': ['all'],
        },
      },
      expect.any(Function),
    );
  });

  it('tries common IPP paths for a bare host', async () => {
    execute.mockImplementation((_operation, _message, callback) => {
      if (vi.mocked(ipp.Printer).mock.calls.length === 1) {
        callback(new Error('not found'));
      } else {
        callback(null, {
          statusCode: 'successful-ok',
          'printer-attributes-tag': { 'printer-name': 'Office' },
        });
      }
    });
    const result = await getPrinterInfo('ipp://printer.local');
    expect(result.uri).toBe('ipp://printer.local/ipp/printer');
    expect(ipp.Printer).toHaveBeenNthCalledWith(
      1,
      'ipp://printer.local/ipp/print',
      { uri: 'ipp://printer.local/ipp/print', version: '2.0' },
    );
    expect(ipp.Printer).toHaveBeenNthCalledWith(
      2,
      'ipp://printer.local/ipp/printer',
      { uri: 'ipp://printer.local/ipp/printer', version: '2.0' },
    );
  });

  it('rejects unsupported schemes before making a request', async () => {
    await expect(
      getPrinterInfo('file:///tmp/printer'),
    ).rejects.toThrow(/must use/);
    expect(ipp.Printer).not.toHaveBeenCalled();
  });
});
