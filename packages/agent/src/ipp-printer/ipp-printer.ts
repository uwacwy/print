import ipp from 'ipp';
import { spawn } from 'node:child_process';
import type {
  PrintDocumentFormat,
  PrintQuality,
} from '../printer-options/printer-options.js';
import type { PrintJob } from '../printer/printer.js';

export type { PrintDocumentFormat };

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

function makePrinter(uri: URL, timeoutMs: number) {
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

export async function getSupportedDocumentFormats(
  uri: URL,
): Promise<string[]> {
  const printer = makePrinter(uri, 15_000);
  const response = await new Promise<
    import('ipp').GetPrinterAttributesResponse
  >((resolve, reject) => {
    printer.execute(
      'Get-Printer-Attributes',
      {
        'operation-attributes-tag': {
          'requesting-user-name': 'omega-print-agent',
          'requested-attributes': ['document-format-supported'],
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
  return typeof formats === 'string' ? [formats] : (formats ?? []);
}

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

export function convertPdfToPclm(
  pdf: Buffer,
  maximumBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'gs',
      [
        '-q',
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-sDEVICE=pclm',
        '-r300',
        '-sOutputFile=-',
        '-',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let stderr = '';
    let outputTooLarge = false;
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumBytes) {
        outputTooLarge = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 120_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      const code = (error as NodeJS.ErrnoException).code;
      reject(
        code === 'ENOENT'
          ? new Error(
              'This printer requires PCLm, but Ghostscript is not installed on the agent.',
            )
          : error,
      );
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (outputTooLarge) {
        return reject(
          new Error(
            'PCLm output exceeds maxBytes; raise ?maxBytes= on PRINTER_URI.',
          ),
        );
      }
      if (timedOut) {
        return reject(
          new Error('Ghostscript PDF conversion timed out.'),
        );
      }
      if (code === 0) {
        return resolve(Buffer.concat(chunks, outputBytes));
      }
      reject(
        new Error(
          `Ghostscript exited ${code ?? signal}: ${stderr.trim() || 'PDF conversion failed'}`,
        ),
      );
    });
    child.stdin.once('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') {
        reject(error);
      }
    });
    child.stdin.end(pdf);
  });
}

export interface PrintDocumentOptions {
  quality?: PrintQuality;
  timeoutMs?: number;
}

export async function printDocument(
  uri: URL,
  data: Buffer,
  job: PrintJob,
  format: PrintDocumentFormat,
  { quality, timeoutMs = 120_000 }: PrintDocumentOptions = {},
): Promise<void> {
  const printer = makePrinter(uri, timeoutMs);
  const title =
    job.title.replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 120) ||
    'Print job';
  await new Promise<void>((resolve, reject) => {
    printer.execute(
      'Print-Job',
      {
        'operation-attributes-tag': {
          'requesting-user-name': 'omega-print-agent',
          'job-name': title,
          'document-format': format,
        },
        ...(quality
          ? { 'job-attributes-tag': { 'print-quality': quality } }
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
