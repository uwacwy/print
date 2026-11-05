import { inject, Service } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface PrinterInput {
  slug: string;
  name: string;
  queue: string;
  coverPage: boolean;
}

export interface PrinterSummary extends PrinterInput {
  id: number;
  lastSeenAt: string | null;
  activeJobs: number;
  /** Failed jobs that still have their document and can be retried. */
  failedJobs: number;
  online: boolean;
  /** Formatted as ###-###-###, or null when PIN uploads are disabled. */
  pin: string | null;
  qrEpoch: number;
}

export type UploadTokenStatus =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'not-yet-valid';

export interface UploadAccess {
  /** True when the request carried a Microsoft Entra sign-in allowed to print without a PIN or token. */
  signedIn: boolean;
  pinEnabled: boolean;
  /** Verification result for the Bearer token sent with the request, or null when none was sent. */
  token: UploadTokenStatus | null;
  tokenExpiresAt: string | null;
}

export interface UploadLimits {
  maxDocuments: number;
  maxCopies: number;
  maxUploadBytes: number;
}

export interface PublicPrinter {
  slug: string;
  name: string;
  coverPage: boolean;
  access: UploadAccess;
  upload: UploadLimits;
}

export interface IssuedUploadToken {
  token: string;
  expiresAt: string;
}

export interface UploadTokenWindow {
  notBefore?: string;
  expiresAt?: string;
}

export interface IssuedQrToken extends IssuedUploadToken {
  /** Relative print-page link including the token. */
  path: string;
  url: string;
  notBefore: string;
}

/** Either reuse an issued token or request a new one for the given window. */
export type QrPosterRequest = UploadTokenWindow & { token?: string };

export interface SubmittedJob {
  jobId: string;
  title: string;
  agentOnline: boolean;
}

export interface CreatedPrinter {
  printer: PrinterSummary;
  agentToken: string;
}

export interface QueuedQrSheet {
  jobId: string;
  agentOnline: boolean;
}

export interface RetriedJobs {
  retried: number;
  printer: PrinterSummary;
}

export interface DeletedJobs {
  deleted: number;
  printer: PrinterSummary;
}

@Service()
export class PrinterService {
  readonly #http = inject(HttpClient);

  getPrinter(slug: string, token?: string | null) {
    return this.#http.get<PublicPrinter>(printerUrl(slug), {
      headers: token ? bearer(token) : undefined,
    });
  }

  /** Trades the printer PIN for a short-lived upload token. */
  exchangePin(slug: string, pin: string) {
    return this.#http.post<IssuedUploadToken>(
      `${printerUrl(slug)}/token`,
      null,
      {
        headers: new HttpHeaders({
          authorization: `Pin ${pin}`,
          'x-print-upload': '1',
        }),
      },
    );
  }

  /** Multipart upload; the header proves same-origin intent (see api/middleware/same-origin.ts). */
  /** Without an upload token, the MSAL interceptor supplies the signed-in user's access token. */
  submitJob(slug: string, form: FormData, token?: string | null) {
    const headers = token ? bearer(token) : new HttpHeaders();
    return this.#http.post<SubmittedJob>(
      `${printerUrl(slug)}/jobs`,
      form,
      { headers: headers.set('x-print-upload', '1') },
    );
  }

  listAdminPrinters() {
    return this.#http.get<PrinterSummary[]>('/api/printers');
  }

  getAdminPrinter(slug: string) {
    return this.#http.get<PrinterSummary>(`${printerUrl(slug)}`);
  }

  createAdminPrinter(input: PrinterInput) {
    return this.#http.post<CreatedPrinter>('/api/printers', input);
  }

  updateAdminPrinter(slug: string, input: PrinterInput) {
    return this.#http.patch<PrinterSummary>(
      `${printerUrl(slug)}`,
      input,
    );
  }

  deleteAdminPrinter(slug: string) {
    return this.#http.delete<void>(`${printerUrl(slug)}`);
  }

  /** Fetched as a blob because management routes need the MSAL bearer token, which a plain link cannot send. */
  getQrPoster(slug: string, request: QrPosterRequest = {}) {
    return this.#http.post(`${printerUrl(slug)}/qr.pdf`, request, {
      responseType: 'blob',
    });
  }

  printQrPoster(slug: string, request: QrPosterRequest = {}) {
    return this.#http.post<QueuedQrSheet>(
      `${printerUrl(slug)}/qr-print`,
      request,
    );
  }

  issueQrToken(slug: string, window: UploadTokenWindow = {}) {
    return this.#http.post<IssuedQrToken>(
      `${printerUrl(slug)}/qr-token`,
      window,
    );
  }

  /** Invalidates every QR (and PIN) upload token issued so far for this printer. */
  revokeQrCodes(slug: string) {
    return this.#http.post<PrinterSummary>(
      `${printerUrl(slug)}/qr-epoch`,
      {},
    );
  }

  refreshPin(slug: string) {
    return this.#http.post<PrinterSummary>(
      `${printerUrl(slug)}/pin`,
      {},
    );
  }

  disablePin(slug: string) {
    return this.#http.delete<PrinterSummary>(
      `${printerUrl(slug)}/pin`,
    );
  }

  rotateAgentToken(slug: string) {
    return this.#http.post<CreatedPrinter>(
      `${printerUrl(slug)}/agent-token`,
      {},
    );
  }

  retryFailedJobs(slug: string) {
    return this.#http.post<RetriedJobs>(
      `${printerUrl(slug)}/jobs/retry`,
      {},
    );
  }

  deleteAllJobs(slug: string) {
    return this.#http.delete<DeletedJobs>(
      `${printerUrl(slug)}/jobs`,
    );
  }
}

const printerUrl = (slug: string) =>
  `/api/printers/${encodeURIComponent(slug)}`;

const bearer = (token: string) =>
  new HttpHeaders({ authorization: `Bearer ${token}` });
