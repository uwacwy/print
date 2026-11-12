import type { AgentJob } from '@uwacwy/print-shared';
import type { Observable } from 'rxjs';

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  IPrinter,
  PrinterOptions,
  PrintRequest,
  PrintResult,
} from '../../types';

import {
  CUPS_JOB_WAIT_MS,
  CUPS_POLL_MS,
  CUPS_RETRY_DELAYS_MS,
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

/**
 * `cups://Queue_Name?maxBytes=…&mimeTypes=…&timeout=…&dpi=…&option_<name>=<value>…` prints
 * through local `lp` with only `-d`, `-t`, and any configured `-o` options.
 *
 * The PDF is first rewritten by Ghostscript with images downsampled to `dpi` (default 150), so
 * the queue's filters rasterize it to a format the printer supports without overrunning its
 * memory. The job is reported printed only after CUPS says it completed. When CUPS stops the
 * queue after a printer error, the queue is re-enabled up to 3 times so CUPS retries the job.
 */
export class CupsPrinter implements IPrinter {
  readonly cups: CupsClient;
  jobWaitMs = CUPS_JOB_WAIT_MS;
  /** `lp -o` arguments from `option_*` query parameters, in connection-string order. */
  readonly lpOptions: readonly string[];
  readonly options: PrinterOptions;
  pollMs = CUPS_POLL_MS;
  readonly queue: string;
  readonly results$: Observable<PrintResult>;
  retryDelaysMs = CUPS_RETRY_DELAYS_MS;

  constructor(
    conn: string | URL,
    jobs$: Observable<PrintRequest>,
  ) {
    const { conn: rest, lpOptions } = takeLpOptions(conn);
    const { options, uri } = parsePrinterConnection(
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

  async print(pdf: Buffer, job: AgentJob): Promise<void> {
    const { dpi = 0 } = this.options;
    const title = jobTitle(job);
    log(
      `[cups:${this.queue}] Received: '${title}' (${pdf.length.toLocaleString()} bytes)`,
    );
    const document = dpi ? await simplifyPdf(pdf, { dpi }) : pdf;
    await this.cups.ensureEnabled();
    log(`[cups:${this.queue}] Submitting: ${title}`);
    const jobId = await this.#submit(document, title);
    await this.cups.waitForJob(jobId, {
      pollMs: this.pollMs,
      retryDelaysMs: this.retryDelaysMs,
      waitMs: this.jobWaitMs,
    });
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  async #submit(pdf: Buffer, title: string): Promise<string> {
    const directory = await mkdtemp(
      join(tmpdir(), 'omega-print-'),
    );
    try {
      const file = join(directory, 'document.pdf');
      await writeFile(file, pdf, { flag: 'wx', mode: 0o600 });
      return await this.cups.submit(file, title, this.lpOptions);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
}
