import ipp from 'ipp';

import type {
  PrintDocumentFormat,
  PrintDocumentOptions,
  PrintJob,
} from '../../types';

import { jobTitle } from '../text/text';

export function chooseDocumentFormat(
  supported: readonly string[],
): PrintDocumentFormat {
  if (supported.includes('application/pdf')) {
    return 'application/pdf';
  }
  if (supported.includes('application/PCLm')) {
    return 'application/PCLm';
  }
  throw new Error(
    `Printer does not advertise application/pdf or application/PCLm (supports: ${supported.join(', ') || 'none'}).`,
  );
}

export async function getSupportedDocumentFormats(
  uri: URL,
): Promise<string[]> {
  const printer = makePrinter(uri, 15000);
  const response = await new Promise<
    import('ipp').GetPrinterAttributesResponse
  >((resolve, reject) => {
    printer.execute(
      'Get-Printer-Attributes',
      {
        'operation-attributes-tag': {
          'requested-attributes': ['document-format-supported'],
          'requesting-user-name': 'omega-print-agent',
        },
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result?.statusCode?.startsWith('successful-')) {
          return reject(
            new Error(
              `IPP Get-Printer-Attributes failed: ${result?.statusCode ?? 'no status'}`,
            ),
          );
        }
        resolve(result);
      },
    );
  });
  const formats =
    response['printer-attributes-tag']?.[
      'document-format-supported'
    ];
  return typeof formats === 'string'
    ? [formats]
    : (formats ?? []);
}

export function makePrinter(uri: URL, timeoutMs: number) {
  const transport = new URL(uri);
  const ippUri = new URL(uri);
  if (transport.protocol === 'ipp:') {
    transport.protocol = 'http:';
  }
  if (transport.protocol === 'ipps:') {
    transport.protocol = 'https:';
  }
  if (ippUri.protocol === 'http:') {
    ippUri.protocol = 'ipp:';
  }
  if (ippUri.protocol === 'https:') {
    ippUri.protocol = 'ipps:';
  }

  const printer = ipp.Printer(transport.toString(), {
    uri: ippUri.toString(),
    version: '2.0',
  });

  printer.url.signal = AbortSignal.timeout(timeoutMs);

  return printer;
}

export async function printDocument(
  uri: URL,
  data: Buffer,
  job: PrintJob,
  format: PrintDocumentFormat,
  { quality, timeoutMs = 120_000 }: PrintDocumentOptions = {},
): Promise<void> {
  const printer = makePrinter(uri, timeoutMs);
  await new Promise<void>((resolve, reject) => {
    printer.execute(
      'Print-Job',
      {
        'operation-attributes-tag': {
          'document-format': format,
          'job-name': jobTitle(job),
          'requesting-user-name': 'omega-print-agent',
        },
        ...(quality
          ? {
              'job-attributes-tag': { 'print-quality': quality },
            }
          : {}),
        data,
      },
      (error, response) => {
        if (error) {
          return reject(error);
        }
        if (!response?.statusCode?.startsWith('successful-')) {
          return reject(
            new Error(
              `IPP Print-Job failed: ${response?.statusCode ?? 'no status'}`,
            ),
          );
        }
        resolve();
      },
    );
  });
}

export function validateIppPrinterUri(value: string): URL {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new Error(
      'PRINTER_URI must be a valid ipp://, ipps://, http://, or https:// URL.',
    );
  }
  if (
    (uri.protocol !== 'ipp:' &&
      uri.protocol !== 'ipps:' &&
      uri.protocol !== 'http:' &&
      uri.protocol !== 'https:') ||
    !uri.hostname ||
    uri.username ||
    uri.password ||
    !uri.pathname ||
    uri.pathname === '/'
  ) {
    throw new Error(
      'PRINTER_URI must include a printer endpoint, use an IPP/HTTP scheme, and contain no embedded credentials.',
    );
  }
  return uri;
}
