import type {
  AgentClientEvents,
  AgentJob,
  AgentServerEvents,
  JobReport,
} from '@uwacwy/print-shared';
import type { Observable } from 'rxjs';
import type { Socket } from 'socket.io-client';

export type AgentSocket = Socket<
  AgentServerEvents,
  AgentClientEvents
>;
export interface CupsJobOutcome {
  /** `Alerts:` keywords, e.g. job-completed-successfully or canceled-at-device. */
  alerts: string[];
  /** `Status:` message, often CUPS' last error for the job. */
  status: string;
}

export interface CupsQueueState {
  enabled: boolean;
  /** Why CUPS stopped the queue, e.g. "Unable to add document to print job." */
  reason: string;
}

export interface CupsWaitOptions {
  log?: (message: string) => void;
  pollMs: number;
  /** Wait before each re-enable after CUPS stops the queue; its length is the retry limit. */
  retryDelaysMs?: readonly number[];
  /** Longest a job may stay pending, retries included, before it is canceled. */
  waitMs: number;
}

/** Response headers checked before a job download's body is read. */
export interface DownloadHeaders {
  /** The Content-Length header, when the server sent one. */
  contentLength: null | string;
  contentType: null | string;
}

export interface IPrinter {
  /** Settings parsed from the connection string's query. */
  readonly options: PrinterOptions;
  /** Prints immediately, outside the request stream. */
  print(pdf: Buffer, job: PrintJob): Promise<void>;
  /** Resolves once the printer can accept work (e.g. after IPP format negotiation). */
  ready(): Promise<void>;
  /** One result per request from `jobs$`, in order; completes after `jobs$` does. */
  readonly results$: Observable<PrintResult>;
}

export type PrintDocumentFormat =
  'application/PCLm' | 'application/pdf';

export interface PrintDocumentOptions {
  quality?: PrintQuality;
  timeoutMs?: number;
}

/** Every driver is constructed from the same `scheme://destination?options` string. */
export type PrinterConstructor = new (
  conn: string | URL,
  jobs$: Observable<PrintRequest>,
) => IPrinter;

export type PrinterOptionName =
  | 'dpi'
  | 'format'
  | 'maxBytes'
  | 'mimeTypes'
  | 'quality'
  | 'timeout';

/** Driver settings read from the PRINTER_URI query string. */
export interface PrinterOptions {
  /** CUPS only: downsample images to this resolution before `lp`; 0 sends the PDF untouched. */
  dpi?: number;
  /** IPP only: skips Get-Printer-Attributes negotiation. */
  format?: PrintDocumentFormat;
  /** Largest document (and converted output) the printer will handle. */
  maxBytes: number;
  /** Content types the agent accepts from the server. */
  mimeTypes: readonly string[];
  quality?: PrintQuality;
  /** Kills or aborts a single print after this long. */
  timeoutMs: number;
}

/** Prints one document; rejects when the printer does not accept it. */
export type PrintFn = (
  pdf: Buffer,
  job: AgentJob,
) => Promise<void>;

export interface PrintJob {
  title: string;
}

export type PrintQuality = 'draft' | 'high' | 'normal';

export interface PrintRequest {
  job: AgentJob;
  pdf: Buffer;
}

export type PrintResult = JobReport & { job: AgentJob };
