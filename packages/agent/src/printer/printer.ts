import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentJob, JobReport } from '@uwacwy/print-shared';
import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  map,
  Observable,
  of,
  Subject,
} from 'rxjs';
import {
  chooseDocumentFormat,
  convertPdfToPclm,
  getSupportedDocumentFormats,
  printDocument,
  validateIppPrinterUri,
} from '../ipp-printer/ipp-printer.js';
import {
  parsePrinterConnection,
  type PrintDocumentFormat,
  type PrinterOptions,
} from '../printer-options/printer-options.js';

export interface PrintJob {
  title: string;
}

export interface PrintRequest {
  job: AgentJob;
  pdf: Buffer;
}

export type PrintResult = { job: AgentJob } & JobReport;

export interface IPrinter {
  /** Settings parsed from the connection string's query. */
  readonly options: PrinterOptions;
  /** One result per enqueued job, in the order the jobs were enqueued. */
  readonly results$: Observable<PrintResult>;
  /** Resolves once the printer can accept work (e.g. after IPP format negotiation). */
  ready(): Promise<void>;
  /** Queues a document; jobs print one at a time. */
  enqueue(job: AgentJob, pdf: Buffer): void;
  /** Prints immediately, bypassing the queue. */
  print(pdf: Buffer, job: PrintJob): Promise<void>;
  /** Drops queued jobs; the one printing finishes and reports, then `results$` completes. */
  destroy(): void;
}

/** Every driver is constructed from the same `scheme://destination?options` string. */
export type PrinterConstructor = new (
  conn: string | URL,
) => IPrinter;

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message.slice(0, 500)
    : 'Unknown print error';

const jobTitle = (job: PrintJob) =>
  job.title.replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 120) ||
  'Print job';

/** Feeds a `Subject` of requests through `print`, one at a time. */
abstract class QueuedPrinter implements IPrinter {
  readonly #queue = new Subject<PrintRequest>();
  readonly #results = new Subject<PrintResult>();
  #destroyed = false;
  readonly results$ = this.#results.asObservable();

  constructor(readonly options: PrinterOptions) {
    this.#queue
      .pipe(
        concatMap(({ job, pdf }) =>
          defer(() =>
            this.#destroyed ? EMPTY : this.print(pdf, job),
          ).pipe(
            map((): PrintResult => ({ job, status: 'printed' })),
            catchError((error: unknown) =>
              of<PrintResult>({
                job,
                status: 'failed',
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      )
      .subscribe(this.#results);
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  enqueue(job: AgentJob, pdf: Buffer): void {
    this.#queue.next({ job, pdf });
  }

  destroy(): void {
    this.#destroyed = true;
    this.#queue.complete();
  }

  abstract print(pdf: Buffer, job: PrintJob): Promise<void>;
}

const LP_OPTION_PREFIX = 'option_';
const LP_OPTION_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const LP_OPTION_VALUE = /^[^\s\0-\x1f\x7f]{0,256}$/;

/**
 * Pulls `option_<name>=<value>` pairs out of a CUPS connection string so they can be
 * passed to `lp` verbatim as `-o <name>=<value>` (or `-o <name>` when the value is empty).
 */
function takeLpOptions(conn: string | URL): {
  conn: URL;
  lpOptions: string[];
} {
  let uri: URL;
  try {
    uri = new URL(conn);
  } catch {
    throw new Error('PRINTER_URI must be a valid URL.');
  }
  const lpOptions: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of [...uri.searchParams]) {
    if (!key.startsWith(LP_OPTION_PREFIX)) {
      continue;
    }
    const name = key.slice(LP_OPTION_PREFIX.length);
    if (!LP_OPTION_NAME.test(name)) {
      throw new Error(
        `PRINTER_URI lp option "${key}" has an invalid name.`,
      );
    }
    if (!LP_OPTION_VALUE.test(value)) {
      throw new Error(
        `PRINTER_URI lp option "${key}" must not contain spaces or control characters.`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`PRINTER_URI option "${key}" is repeated.`);
    }
    seen.add(name);
    lpOptions.push(value ? `${name}=${value}` : name);
    uri.searchParams.delete(key);
  }
  return { conn: uri, lpOptions };
}

/**
 * `cups://Queue_Name?maxBytes=…&mimeTypes=…&timeout=…&option_<name>=<value>…` prints through
 * local `lp` with only `-d`, `-t`, and any configured `-o` options.
 */
export class CupsPrinter extends QueuedPrinter {
  readonly queue: string;
  /** `lp -o` arguments from `option_*` query parameters, in connection-string order. */
  readonly lpOptions: readonly string[];

  constructor(conn: string | URL) {
    const { conn: rest, lpOptions } = takeLpOptions(conn);
    const { uri, options } = parsePrinterConnection(rest, [
      'maxBytes',
      'mimeTypes',
      'timeout',
    ]);
    if (
      uri.protocol !== 'cups:' ||
      uri.username ||
      uri.password ||
      uri.port ||
      uri.hash ||
      uri.pathname ||
      !uri.hostname
    ) {
      throw new Error(
        'CUPS destination must be cups://<queue_name>. Was '.concat(
          uri.href,
        ),
      );
    }
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(uri.hostname)) {
      throw new Error('CUPS queue contains unsupported characters.');
    }
    super(options);
    this.queue = uri.hostname;
    this.lpOptions = lpOptions;
  }

  async print(pdf: Buffer, job: PrintJob): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'omega-print-'));
    try {
      const file = join(directory, 'document.pdf');
      await writeFile(file, pdf, { mode: 0o600, flag: 'wx' });
      await this.#lp(file, jobTitle(job));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  #lp(file: string, title: string): Promise<void> {
    /**
        lp options (set as option_<name>=<value> on PRINTER_URI)
        --
        -o option[=value]       Specify a printer-specific option
        -o job-sheets=standard  Print a banner page with the job
        -o media=size           Specify the media size to use
        -o number-up=N          Specify that input pages should be printed N-up (1, 2, 4, 6, 9, and 16 are supported)
        -o orientation-requested=N
                                Specify portrait (3) or landscape (4) orientation
        -o print-quality=N      Specify the print quality - draft (3), normal (4), or best (5)
        -o sides=one-sided      Specify 1-sided printing
        -o sides=two-sided-long-edge
                                Specify 2-sided portrait printing
        -o sides=two-sided-short-edge
                                Specify 2-sided landscape printing
     */
    const args = [
      '-d',
      this.queue,
      '-t',
      title,
      ...this.lpOptions.flatMap((option) => ['-o', option]),
      file,
    ];
    const { timeoutMs } = this.options;
    return new Promise((resolve, reject) => {
      const child = spawn('lp', args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-1000);
      });
      const timeout = setTimeout(
        () => child.kill('SIGKILL'),
        timeoutMs,
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
  }
}

/** `ipp(s)://host/path?maxBytes=…&mimeTypes=…&quality=…&timeout=…&format=…` prints over IPP. */
export class IppPrinter extends QueuedPrinter {
  readonly uri: URL;
  #format: Promise<PrintDocumentFormat> | undefined;

  constructor(conn: string | URL) {
    const { uri, options } = parsePrinterConnection(conn, [
      'maxBytes',
      'mimeTypes',
      'quality',
      'timeout',
      'format',
    ]);
    super(options);
    this.uri = validateIppPrinterUri(uri.href);
  }

  /** The negotiated (or `format=`-forced) document format; negotiated once and retried after failure. */
  format(): Promise<PrintDocumentFormat> {
    const forced = this.options.format;
    this.#format ??= forced
      ? Promise.resolve(forced)
      : getSupportedDocumentFormats(this.uri).then(
          chooseDocumentFormat,
          (error: unknown) => {
            this.#format = undefined;
            throw error;
          },
        );
    return this.#format;
  }

  override ready(): Promise<void> {
    return this.format().then(() => undefined);
  }

  async print(pdf: Buffer, job: PrintJob): Promise<void> {
    const format = await this.format();
    const data =
      format === 'application/PCLm'
        ? await convertPdfToPclm(pdf, this.options.maxBytes)
        : pdf;
    await printDocument(this.uri, data, job, format, {
      quality: this.options.quality,
      timeoutMs: this.options.timeoutMs,
    });
  }
}

/** Picks the driver from the connection string's scheme. */
export function createPrinter(conn: string | URL): IPrinter {
  const Driver: PrinterConstructor = String(conn).startsWith(
    'cups://',
  )
    ? CupsPrinter
    : IppPrinter;
  return new Driver(conn);
}
