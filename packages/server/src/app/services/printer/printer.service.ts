import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  $,
  type EnrollTokenResponse,
} from '@uwacwy/print-shared';

export interface CreatedPrinter {
  agentToken: string;
  printer: PrinterSummary;
  /** `PUBLIC_URL` origin for setup commands; null when the server has none. */
  serverUrl: null | string;
}

export interface DeletedJobs {
  deleted: number;
  printer: PrinterSummary;
}

export interface IssuedQrToken extends IssuedUploadToken {
  notBefore: string;
  /** Relative print-page link including the token. */
  path: string;
  url: string;
}

export interface IssuedUploadToken {
  expiresAt: string;
  token: string;
}

export interface PrinterInput {
  coverPage: boolean;
  name: string;
  queue: string;
  slug: string;
}

export interface PrinterSummary extends PrinterInput {
  activeJobs: number;
  /** Failed jobs that still have their document and can be retried. */
  failedJobs: number;
  id: number;
  lastSeenAt: null | string;
  online: boolean;
  /** Formatted as ###-###-###, or null when PIN uploads are disabled. */
  pin: null | string;
  qrEpoch: number;
}

export interface PublicPrinter {
  access: UploadAccess;
  coverPage: boolean;
  name: string;
  slug: string;
  upload: UploadLimits;
}

/** Either reuse an issued token or request a new one for the given window. */
export type QrPosterRequest = UploadTokenWindow & {
  token?: string;
};

export interface QueuedQrSheet {
  agentOnline: boolean;
  jobId: string;
}

export interface RetriedJobs {
  printer: PrinterSummary;
  retried: number;
}

export interface SubmittedJob {
  agentOnline: boolean;
  jobId: string;
  title: string;
}

export interface UploadAccess {
  pinEnabled: boolean;
  /** True when the request carried a Microsoft Entra sign-in allowed to print without a PIN or token. */
  signedIn: boolean;
  /** Verification result for the Bearer token sent with the request, or null when none was sent. */
  token: null | UploadTokenStatus;
  tokenExpiresAt: null | string;
}

export interface UploadLimits {
  maxCopies: number;
  maxDocuments: number;
  maxUploadBytes: number;
}

export type UploadTokenStatus =
  'expired' | 'invalid' | 'not-yet-valid' | 'valid';

export interface UploadTokenWindow {
  expiresAt?: string;
  notBefore?: string;
}

@Service()
export class PrinterService {
  readonly #http = inject(HttpClient);

  createAdminPrinter(input: PrinterInput) {
    return this.#http.post<CreatedPrinter>(
      $.api.printers(),
      input,
    );
  }

  /** A short-lived token the printer's computer exchanges for a new printer and its agent token. */
  createEnrollToken() {
    return this.#http.post<EnrollTokenResponse>(
      $.api.printers.enrollToken(),
      {},
    );
  }

  deleteAdminPrinter(slug: string) {
    return this.#http.delete<void>(
      $.api.printers.$slug({ slug }),
    );
  }

  deleteAllJobs(slug: string) {
    return this.#http.delete<DeletedJobs>(
      $.api.printers.$slug.jobs({ slug }),
    );
  }

  disablePin(slug: string) {
    return this.#http.delete<PrinterSummary>(
      $.api.printers.$slug.pin({ slug }),
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

  getAdminPrinter(slug: string) {
    return this.#http.get<PrinterSummary>(
      $.api.printers.$slug({ slug }),
    );
  }

  getPrinter(slug: string, token?: null | string) {
    return this.#http.get<PublicPrinter>(
      $.api.printers.$slug({ slug }),
      {
        headers: token ? bearer(token) : undefined,
      },
    );
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

  issueQrToken(slug: string, window: UploadTokenWindow = {}) {
    return this.#http.post<IssuedQrToken>(
      $.api.printers.$slug.qrToken({ slug }),
      window,
    );
  }

  listAdminPrinters() {
    return this.#http.get<PrinterSummary[]>($.api.printers());
  }

  printQrPoster(slug: string, request: QrPosterRequest = {}) {
    return this.#http.post<QueuedQrSheet>(
      $.api.printers.$slug.qrPrint({ slug }),
      request,
    );
  }

  refreshPin(slug: string) {
    return this.#http.post<PrinterSummary>(
      $.api.printers.$slug.pin({ slug }),
      {},
    );
  }

  retryFailedJobs(slug: string) {
    return this.#http.post<RetriedJobs>(
      $.api.printers.$slug.jobs.retry({ slug }),
      {},
    );
  }

  /** Invalidates every QR (and PIN) upload token issued so far for this printer. */
  revokeQrCodes(slug: string) {
    return this.#http.post<PrinterSummary>(
      $.api.printers.$slug.qrEpoch({ slug }),
      {},
    );
  }

  rotateAgentToken(slug: string) {
    return this.#http.post<CreatedPrinter>(
      $.api.printers.$slug.agentToken({ slug }),
      {},
    );
  }

  /** Multipart upload; the header proves same-origin intent (see api/middleware/same-origin.ts). */
  /** Without an upload token, the MSAL interceptor supplies the signed-in user's access token. */
  submitJob(
    slug: string,
    form: FormData,
    token?: null | string,
  ) {
    const headers = token ? bearer(token) : new HttpHeaders();
    return this.#http.post<SubmittedJob>(
      $.api.printers.$slug.jobs({ slug }),
      form,
      { headers: headers.set('x-print-upload', '1') },
    );
  }

  updateAdminPrinter(slug: string, input: PrinterInput) {
    return this.#http.patch<PrinterSummary>(
      $.api.printers.$slug({ slug }),
      input,
    );
  }
}

const bearer = (token: string) =>
  new HttpHeaders({ authorization: `Bearer ${token}` });
