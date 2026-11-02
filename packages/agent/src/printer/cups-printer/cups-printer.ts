import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Observable } from 'rxjs';
import {
  CUPS_JOB_WAIT_MS,
  CUPS_POLL_MS,
  CupsClient,
  DEFAULT_CUPS_DPI,
  parseCupsQueue,
  takeLpOptions,
} from '../../helpers/cups/cups';
import { log } from '../../helpers/logging';
import { parsePrinterConnection } from '../../helpers/options/options';
import { simplifyPdf } from '../../helpers/pdf';
import { printInOrder } from '../../helpers/print-queue/print-queue';
import { jobTitle } from '../../helpers/text/text';
import type {
  IPrinter,
  PrinterOptions,
  PrintJob,
  PrintRequest,
  PrintResult,
} from '../../types';

/**
 * `cups://Queue_Name?maxBytes=…&mimeTypes=…&timeout=…&dpi=…&option_<name>=<value>…` prints
 * through local `lp` with only `-d`, `-t`, and any configured `-o` options.
 *
 * The PDF is first rewritten by Ghostscript with images downsampled to `dpi` (default 150), so
 * the queue's filters rasterize it to a format the printer supports without overrunning its
 * memory. The job is reported printed only after CUPS says it completed; a queue CUPS stopped
 * after a printer error is re-enabled before the next job.
 */
export class CupsPrinter implements IPrinter {
  readonly options: PrinterOptions;
  readonly results$: Observable<PrintResult>;
  readonly queue: string;
  /** `lp -o` arguments from `option_*` query parameters, in connection-string order. */
  readonly lpOptions: readonly string[];
  readonly cups: CupsClient;
  jobWaitMs = CUPS_JOB_WAIT_MS;
  pollMs = CUPS_POLL_MS;

  constructor(conn: string | URL, jobs$: Observable<PrintRequest>) {
    const { conn: rest, lpOptions } = takeLpOptions(conn);
    const { uri, options } = parsePrinterConnection(
      rest,
      ['maxBytes', 'mimeTypes', 'timeout', 'dpi'],
      { dpi: DEFAULT_CUPS_DPI },
    );
    this.options = options;
    this.queue = parseCupsQueue(uri);
    this.lpOptions = lpOptions;
    this.cups = new CupsClient(this.queue, options.timeoutMs);
    this.results$ = printInOrder(jobs$, (pdf, job) =>
      this.print(pdf, job),
    );
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  async print(pdf: Buffer, job: PrintJob): Promise<void> {
    const { dpi = 0, maxBytes } = this.options;
    const title = jobTitle(job);
    log(`Spooling job ${title}`);
    const document = dpi
      ? await simplifyPdf(pdf, { dpi, maximumBytes: maxBytes })
      : pdf;
    await this.cups.ensureEnabled();
    const jobId = await this.#submit(document, title);
    await this.cups.waitForJob(jobId, {
      waitMs: this.jobWaitMs,
      pollMs: this.pollMs,
    });
  }

  async #submit(pdf: Buffer, title: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'omega-print-'));
    try {
      const file = join(directory, 'document.pdf');
      await writeFile(file, pdf, { mode: 0o600, flag: 'wx' });
      return await this.cups.submit(file, title, this.lpOptions);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
