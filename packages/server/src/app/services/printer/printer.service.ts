import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  ENROLL_TOKEN_PATH,
  type EnrollTokenResponse,
} from '@uwacwy/print-shared';
import { createRouting } from 'ts-routes';
import { root } from '../../../shared/routes/routes';

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
  /** `PUBLIC_URL` origin for setup commands; null when the server has none. */
  serverUrl: string | null;
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

const $ = createRouting(root);

@Service()
export class PrinterService {
  readonly #http = inject(HttpClient);

  getPrinter(slug: string, token?: string | null) {
    return this.#http.get<PublicPrinter>(
      $.api.printers.$slug({ slug }),
      {
        headers: token ? bearer(token) : undefined,
      },
    );
  }

  /** Trades the printer PIN for a short-lived upload token. */
  exchangePin(slug: string, pin: string) {
    return this.#http.post<IssuedUploadToken>(
      $.api.printers.$slug.token({ slug }),
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
      $.api.printers.$slug.jobs({ slug }),
      form,
      { headers: headers.set('x-print-upload', '1') },
    );
  }

  listAdminPrinters() {
    return this.#http.get<PrinterSummary[]>($.api.printers());
  }

  getAdminPrinter(slug: string) {
    return this.#http.get<PrinterSummary>(
      $.api.printers.$slug({ slug }),
    );
  }

  createAdminPrinter(input: PrinterInput) {
    return this.#http.post<CreatedPrinter>($.api.printers(), input);
  }

  /** A short-lived token the printer's computer exchanges for a new printer and its agent token. */
  createEnrollToken() {
    return this.#http.post<EnrollTokenResponse>(
      ENROLL_TOKEN_PATH,
      {},
    );
  }

  updateAdminPrinter(slug: string, input: PrinterInput) {
    return this.#http.patch<PrinterSummary>(
      $.api.printers.$slug({ slug }),
      input,
    );
  }

  deleteAdminPrinter(slug: string) {
    return this.#http.delete<void>($.api.printers.$slug({ slug }));
  }

  /** Fetched as a blob because management routes need the MSAL bearer token, which a plain link cannot send. */
  getQrPoster(slug: string, request: QrPosterRequest = {}) {
    return this.#http.post(
      $.api.printers.$slug.qrPdf({ slug }),
      request,
      {
        responseType: 'blob',
      },
    );
  }

  printQrPoster(slug: string, request: QrPosterRequest = {}) {
    return this.#http.post<QueuedQrSheet>(
      $.api.printers.$slug.qrPrint({ slug }),
      request,
    );
  }

  issueQrToken(slug: string, window: UploadTokenWindow = {}) {
    return this.#http.post<IssuedQrToken>(
      $.api.printers.$slug.qrToken({ slug }),
      window,
    );
  }

  /** Invalidates every QR (and PIN) upload token issued so far for this printer. */
  revokeQrCodes(slug: string) {
    return this.#http.post<PrinterSummary>(
      $.api.printers.$slug.qrEpoch({ slug }),
      {},
    );
  }

  refreshPin(slug: string) {
    return this.#http.post<PrinterSummary>(
      $.api.printers.$slug.pin({ slug }),
      {},
    );
  }

  disablePin(slug: string) {
    return this.#http.delete<PrinterSummary>(
      $.api.printers.$slug.pin({ slug }),
    );
  }

  rotateAgentToken(slug: string) {
    return this.#http.post<CreatedPrinter>(
      $.api.printers.$slug.agentToken({ slug }),
      {},
    );
  }

  retryFailedJobs(slug: string) {
    return this.#http.post<RetriedJobs>(
      $.api.printers.$slug.jobs.retry({ slug }),
      {},
    );
  }

  deleteAllJobs(slug: string) {
    return this.#http.delete<DeletedJobs>(
      $.api.printers.$slug.jobs({ slug }),
    );
  }
}

const bearer = (token: string) =>
  new HttpHeaders({ authorization: `Bearer ${token}` });
