import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  chooseDocumentFormat,
  convertPdfToPclm,
  getSupportedDocumentFormats,
  printDocument,
  validateIppPrinterUri,
  type PrintDocumentFormat,
} from '../ipp-printer/ipp-printer.js';

export interface PrintJob {
  title: string;
}

export interface IPrinter {
  print(pdf: Buffer, job: PrintJob): Promise<void>;
}

export class CupsPrinter implements IPrinter {
  constructor(private readonly queue: string) {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(queue)) {
      throw new Error('CUPS queue contains unsupported characters.');
    }
  }

  async print(pdf: Buffer, job: PrintJob): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'omega-print-'));
    try {
      const file = join(directory, 'document.pdf');
      await writeFile(file, pdf, { mode: 0o600, flag: 'wx' });
      await new Promise<void>((resolve, reject) => {
        const title =
          job.title.replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 120) ||
          'Print job';
        const child = spawn(
          'lp',
          ['-d', this.queue, '-t', title, file],
          {
            stdio: ['ignore', 'ignore', 'pipe'],
          },
        );
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          stderr = (stderr + chunk).slice(-1000);
        });
        const timeout = setTimeout(
          () => child.kill('SIGKILL'),
          120_000,
        );
        child.once('error', reject);
        child.once('close', (code, signal) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `lp exited ${code ?? signal}: ${stderr.trim() || 'CUPS rejected the job'}`,
              ),
            );
          }
        });
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export class IppPrinter implements IPrinter {
  private constructor(
    private readonly uri: URL,
    private readonly format: PrintDocumentFormat,
    private readonly maximumBytes: number,
  ) {}

  static async connect(
    uri: URL,
    maximumBytes: number,
  ): Promise<IppPrinter> {
    const format = chooseDocumentFormat(
      await getSupportedDocumentFormats(uri),
    );
    return new IppPrinter(uri, format, maximumBytes);
  }

  async print(pdf: Buffer, job: PrintJob): Promise<void> {
    const data =
      this.format === 'application/PCLm'
        ? await convertPdfToPclm(pdf, this.maximumBytes)
        : pdf;
    await printDocument(this.uri, data, job, this.format);
  }
}

export async function createPrinter(
  destination: string,
  maximumBytes: number,
): Promise<IPrinter> {
  if (destination.startsWith('cups://')) {
    const uri = new URL(destination);
    if (
      uri.username ||
      uri.password ||
      uri.port ||
      uri.search ||
      uri.hash ||
      uri.pathname ||
      !uri.hostname
    ) {
      throw new Error(
        'CUPS destination must be cups://<queue_name>.',
      );
    }
    return new CupsPrinter(uri.hostname);
  }
  return IppPrinter.connect(
    validateIppPrinterUri(destination),
    maximumBytes,
  );
}
