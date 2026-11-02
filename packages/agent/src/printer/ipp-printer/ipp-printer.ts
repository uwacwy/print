import type { Observable } from 'rxjs';
import {
  chooseDocumentFormat,
  getSupportedDocumentFormats,
  printDocument,
  validateIppPrinterUri,
} from '../../helpers/ipp/ipp';
import { parsePrinterConnection } from '../../helpers/options/options';
import { convertPdfToPclm } from '../../helpers/pdf';
import { printInOrder } from '../../helpers/print-queue/print-queue';
import type {
  IPrinter,
  PrintDocumentFormat,
  PrinterOptions,
  PrintJob,
  PrintRequest,
  PrintResult,
} from '../../types';

/** `ipp(s)://host/path?maxBytes=…&mimeTypes=…&quality=…&timeout=…&format=…` prints over IPP. */
export class IppPrinter implements IPrinter {
  readonly options: PrinterOptions;
  readonly results$: Observable<PrintResult>;
  readonly uri: URL;
  #format: Promise<PrintDocumentFormat> | undefined;

  constructor(conn: string | URL, jobs$: Observable<PrintRequest>) {
    const { uri, options } = parsePrinterConnection(conn, [
      'maxBytes',
      'mimeTypes',
      'quality',
      'timeout',
      'format',
    ]);
    this.options = options;
    this.uri = validateIppPrinterUri(uri.href);
    this.results$ = printInOrder(jobs$, (pdf, job) =>
      this.print(pdf, job),
    );
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

  ready(): Promise<void> {
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
