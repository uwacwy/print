import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  $,
  CreatedPrinter,
  DeletedJobs,
  EnrollTokenResponse,
  IssuedQrToken,
  IssuedUploadToken,
  parseWith,
  type PrinterInput,
  PrinterSummary,
  PublicPrinter,
  type QrPosterRequest,
  QueuedQrSheet,
  RetriedJobs,
  SubmittedJob,
  type UploadTokenWindow,
} from '@uwacwy/print-shared';
import { map, Observable } from 'rxjs';
import { z } from 'zod';

@Service()
export class PrinterService {
  readonly #http = inject(HttpClient);

  createAdminPrinter(input: PrinterInput) {
    return this.#http
      .post<unknown>($.api.printers(), input)
      .pipe(map(parseWith(CreatedPrinter)));
  }

  /** A short-lived token the printer's computer exchanges for a new printer and its agent token. */
  createEnrollToken() {
    return this.#http
      .post<unknown>($.api.printers.enrollToken(), {})
      .pipe(map(parseWith(EnrollTokenResponse)));
  }

  deleteAdminPrinter(slug: string) {
    return this.#http.delete<void>(
      $.api.printers.$slug({ slug }),
    );
  }

  deleteAllJobs(slug: string) {
    return this.#http
      .delete<unknown>($.api.printers.$slug.jobs({ slug }))
      .pipe(map(parseWith(DeletedJobs)));
  }

  disablePin(slug: string) {
    return this.#http
      .delete<unknown>($.api.printers.$slug.pin({ slug }))
      .pipe(map(parseWith(PrinterSummary)));
  }

  /** Trades the printer PIN for a short-lived upload token. */
  exchangePin(slug: string, pin: string) {
    return this.#http
      .post<unknown>(
        $.api.printers.$slug.token({ slug }),
        null,
        {
          headers: new HttpHeaders({
            authorization: `Pin ${pin}`,
          }),
        },
      )
      .pipe(map(parseWith(IssuedUploadToken)));
  }

  getAdminPrinter(slug: string) {
    return this.#http
      .get<unknown>($.api.printers.$slug({ slug }))
      .pipe(map(parseWith(PrinterSummary)));
  }

  getPrinter(
    slug: string,
    token?: null | string,
  ): Observable<PublicPrinter> {
    return this.#http
      .get<unknown>($.api.printers.$slug({ slug }), {
        headers: token ? bearer(token) : undefined,
      })
      .pipe(map(parseWith(PublicPrinter)));
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
    return this.#http
      .post<unknown>(
        $.api.printers.$slug.qrToken({ slug }),
        window,
      )
      .pipe(map(parseWith(IssuedQrToken)));
  }

  listAdminPrinters() {
    return this.#http
      .get<unknown>($.api.printers())
      .pipe(map(parseWith(z.array(PrinterSummary))));
  }

  printQrPoster(slug: string, request: QrPosterRequest = {}) {
    return this.#http
      .post<unknown>(
        $.api.printers.$slug.qrPrint({ slug }),
        request,
      )
      .pipe(map(parseWith(QueuedQrSheet)));
  }

  refreshPin(slug: string) {
    return this.#http
      .post<unknown>($.api.printers.$slug.pin({ slug }), {})
      .pipe(map(parseWith(PrinterSummary)));
  }

  retryFailedJobs(slug: string) {
    return this.#http
      .post<unknown>(
        $.api.printers.$slug.jobs.retry({ slug }),
        {},
      )
      .pipe(map(parseWith(RetriedJobs)));
  }

  /** Invalidates every QR (and PIN) upload token issued so far for this printer. */
  revokeQrCodes(slug: string) {
    return this.#http
      .post<unknown>($.api.printers.$slug.qrEpoch({ slug }), {})
      .pipe(map(parseWith(PrinterSummary)));
  }

  rotateAgentToken(slug: string) {
    return this.#http
      .post<unknown>(
        $.api.printers.$slug.agentToken({ slug }),
        {},
      )
      .pipe(map(parseWith(CreatedPrinter)));
  }

  /** Multipart upload. Without an upload token, the MSAL interceptor supplies the signed-in user's access token. */
  submitJob(
    slug: string,
    form: FormData,
    token?: null | string,
  ) {
    return this.#http
      .post<unknown>(
        $.api.printers.$slug.jobs({ slug }),
        form,
        token ? { headers: bearer(token) } : {},
      )
      .pipe(map(parseWith(SubmittedJob)));
  }

  updateAdminPrinter(slug: string, input: PrinterInput) {
    return this.#http
      .patch<unknown>($.api.printers.$slug({ slug }), input)
      .pipe(map(parseWith(PrinterSummary)));
  }
}

const bearer = (token: string) =>
  new HttpHeaders({ authorization: `Bearer ${token}` });
