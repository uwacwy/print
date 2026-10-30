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
  online: boolean;
  /** Formatted as ###-###-###, or null when PIN uploads are disabled. */
  pin: string | null;
  qrEpoch: number;
}

export type UploadTokenStatus = 'valid' | 'invalid' | 'expired' | 'not-yet-valid';

export interface UploadAccess {
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

export interface DeletedJobs {
  deleted: number;
  printer: PrinterSummary;
}

@Service()
export class PrinterService {
  readonly #http = inject(HttpClient);

  getPrinter(slug: string, token?: string | null) {
    return this.#http.get<PublicPrinter>(`/api/printers/${encodeURIComponent(slug)}`, {
      headers: token ? bearer(token) : undefined,
    });
  }

  /** Trades the printer PIN for a short-lived upload token. */
  exchangePin(slug: string, pin: string) {
    return this.#http.post<IssuedUploadToken>(
      `/api/printers/${encodeURIComponent(slug)}/token`,
      { pin },
      { headers: new HttpHeaders({ 'x-print-upload': '1' }) },
    );
  }

  /** Multipart upload; the header proves same-origin intent (see upload.router.ts). */
  submitJob(slug: string, form: FormData, token: string) {
    return this.#http.post<SubmittedJob>(`/api/printers/${encodeURIComponent(slug)}/jobs`, form, {
      headers: bearer(token).set('x-print-upload', '1'),
    });
  }

  listAdminPrinters() {
    return this.#http.get<PrinterSummary[]>('/api/admin/printers');
  }

  getAdminPrinter(id: number) {
    return this.#http.get<PrinterSummary>(`/api/admin/printers/${id}`);
  }

  createAdminPrinter(input: PrinterInput) {
    return this.#http.post<CreatedPrinter>('/api/admin/printers', input);
  }

  updateAdminPrinter(id: number, input: PrinterInput) {
    return this.#http.patch<PrinterSummary>(`/api/admin/printers/${id}`, input);
  }

  deleteAdminPrinter(id: number) {
    return this.#http.delete<void>(`/api/admin/printers/${id}`);
  }

  /** Fetched as a blob because admin routes need the MSAL bearer token, which a plain link cannot send. */
  getQrPoster(id: number, request: QrPosterRequest = {}) {
    return this.#http.post(`/api/admin/printers/${id}/qr.pdf`, request, { responseType: 'blob' });
  }

  printQrPoster(id: number, request: QrPosterRequest = {}) {
    return this.#http.post<QueuedQrSheet>(`/api/admin/printers/${id}/qr-print`, request);
  }

  issueQrToken(id: number, window: UploadTokenWindow = {}) {
    return this.#http.post<IssuedQrToken>(`/api/admin/printers/${id}/qr-token`, window);
  }

  /** Invalidates every QR (and PIN) upload token issued so far for this printer. */
  revokeQrCodes(id: number) {
    return this.#http.post<PrinterSummary>(`/api/admin/printers/${id}/qr-epoch`, {});
  }

  refreshPin(id: number) {
    return this.#http.post<PrinterSummary>(`/api/admin/printers/${id}/pin`, {});
  }

  disablePin(id: number) {
    return this.#http.delete<PrinterSummary>(`/api/admin/printers/${id}/pin`);
  }

  rotateAgentToken(id: number) {
    return this.#http.post<CreatedPrinter>(`/api/admin/printers/${id}/token`, {});
  }

  deleteAllJobs(id: number) {
    return this.#http.delete<DeletedJobs>(`/api/admin/printers/${id}/jobs`);
  }
}

const bearer = (token: string) => new HttpHeaders({ authorization: `Bearer ${token}` });
