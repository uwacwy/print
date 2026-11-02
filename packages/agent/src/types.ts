import type {
  AgentClientEvents,
  AgentJob,
  AgentServerEvents,
  JobReport,
} from '@uwacwy/print-shared';
import type { Observable } from 'rxjs';
import type { Socket } from 'socket.io-client';

export type PrintQuality = 'draft' | 'normal' | 'high';
export type PrintDocumentFormat =
  | 'application/pdf'
  | 'application/PCLm';

/** Driver settings read from the PRINTER_URI query string. */
export interface PrinterOptions {
  /** Largest document (and converted output) the printer will handle. */
  maxBytes: number;
  /** Content types the agent accepts from the server. */
  mimeTypes: readonly string[];
  quality?: PrintQuality;
  /** Kills or aborts a single print after this long. */
  timeoutMs: number;
  /** IPP only: skips Get-Printer-Attributes negotiation. */
  format?: PrintDocumentFormat;
  /** CUPS only: downsample images to this resolution before `lp`; 0 sends the PDF untouched. */
  dpi?: number;
}

export type PrinterOptionName =
  | 'maxBytes'
  | 'mimeTypes'
  | 'quality'
  | 'timeout'
  | 'format'
  | 'dpi';

export interface PrintDocumentOptions {
  quality?: PrintQuality;
  timeoutMs?: number;
}

export interface PrintJob {
  title: string;
}

export interface PrintRequest {
  job: AgentJob;
  pdf: Buffer;
}

export type PrintResult = { job: AgentJob } & JobReport;

/** Prints one document; rejects when the printer does not accept it. */
export type PrintFn = (pdf: Buffer, job: PrintJob) => Promise<void>;

export interface IPrinter {
  /** Settings parsed from the connection string's query. */
  readonly options: PrinterOptions;
  /** One result per request from `jobs$`, in order; completes after `jobs$` does. */
  readonly results$: Observable<PrintResult>;
  /** Resolves once the printer can accept work (e.g. after IPP format negotiation). */
  ready(): Promise<void>;
  /** Prints immediately, outside the request stream. */
  print(pdf: Buffer, job: PrintJob): Promise<void>;
}

/** Every driver is constructed from the same `scheme://destination?options` string. */
export type PrinterConstructor = new (
  conn: string | URL,
  jobs$: Observable<PrintRequest>,
) => IPrinter;

export interface CupsQueueState {
  enabled: boolean;
  /** Why CUPS stopped the queue, e.g. "Unable to add document to print job." */
  reason: string;
}

export interface CupsJobOutcome {
  /** `Alerts:` keywords, e.g. job-completed-successfully or canceled-at-device. */
  alerts: string[];
  /** `Status:` message, often CUPS' last error for the job. */
  status: string;
}

/** Response headers checked before a job download's body is read. */
export interface DownloadHeaders {
  contentType: string | null;
  /** The Content-Length header, when the server sent one. */
  contentLength: string | null;
}

export type AgentSocket = Socket<
  AgentServerEvents,
  AgentClientEvents
>;
