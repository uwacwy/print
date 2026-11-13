import type { EnrollTokenResponse } from '@uwacwy/print-shared';
import type { ParamsDictionary } from 'express-serve-static-core';

import {
  PrinterInput,
  printers,
  QrPosterRequest,
} from '@uwacwy/print-shared';
import express, {
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { access as fileAccess, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRouting } from 'ts-routes';

import type {
  EnrollmentConfig,
  UploadConfig,
} from '../../helpers/server-config/server-config';
import type { Authenticate } from '../../middleware/auth/passport/passport';
import type { AgentHub } from '../../sockets/agent-hub/agent-hub';

import {
  bumpQrEpoch,
  countActiveJobs,
  countFailedJobs,
  createPrinter,
  deletePrinter,
  deletePrinterJobs,
  expireFailedJobs,
  getFailedJobIds,
  getPrinterById,
  getPrinterBySlug,
  listPrinters,
  type PrintDatabase,
  type PrinterRow,
  requeueFailedJobs,
  rotatePrinterToken,
  setPrinterPin,
  updatePrinter,
} from '../../helpers/database/database';
import { enqueueJob } from '../../helpers/database/jobs';
import { signEnrollToken } from '../../helpers/enroll-token/enroll-token';
import { UploadError } from '../../helpers/errors';
import { copiesValid, jobTitle } from '../../helpers/jobs';
import {
  type JobSubmission,
  readMultipartSubmission,
} from '../../helpers/multipart';
import { addCoverPage } from '../../helpers/pdf/cover-page/cover-page';
import { combineDocuments } from '../../helpers/pdf/document/document';
import { buildQrPoster } from '../../helpers/pdf/qr-poster/qr-poster';
import {
  managedPrinter,
  printerView,
  printPath,
  toPrinterFields,
} from '../../helpers/printers';
import {
  formatPin,
  generatePin,
} from '../../middleware/auth/pin/pin';
import {
  optionalPrincipal,
  principal,
  submittedBy,
} from '../../middleware/auth/principal';
import {
  inspectUploadToken,
  signUploadToken,
  type UploadToken,
  UploadTokenWindowError,
  verifyUploadToken,
} from '../../middleware/auth/upload-token/upload-token';
import { uploadTokenStatus } from '../../middleware/auth/upload-token/upload-token.strategy';
import {
  pinFailureRateLimit,
  pinIssuanceRateLimit,
  uploadRateLimit,
} from '../../middleware/rate-limits/rate-limits';
import { validate } from '../../middleware/validate/validate';

const routes = createRouting(printers);

export interface PrintersRouterOptions {
  authenticate: Authenticate;
  db: PrintDatabase;
  enrollment?: EnrollmentConfig;
  getHub: () => AgentHub;
  jobsDir: string;
  /** Canonical origin for upload links on QR posters; falls back to the request origin. */
  siteUrl?: URL;
  upload: UploadConfig;
}

const DEFAULT_ENROLL_TOKEN_TTL_MINUTES = 30;

const DEFAULT_QR_LIFETIME_MS = 24 * 3_600_000;

/** The printer loaded by the `:slug` parameter handler. */
const printerOf = (response: Response) =>
  response.locals['printer'] as PrinterRow;

/** Every `/printers` route; each declares the credentials it accepts. */
export default function printersRouter({
  authenticate,
  db,
  enrollment,
  getHub,
  jobsDir,
  siteUrl,
  upload,
}: PrintersRouterOptions) {
  const serverUrl = enrollment?.serverUrl ?? null;
  const { access } = upload;
  const admin = authenticate('entraUser');
  const managePin = authenticate(
    'entraUser',
    'entraApp:Printer.ManagePin',
  );
  const pinFailures = pinFailureRateLimit(upload);

  const summary = (
    printer: PrinterRow,
    activeJobs = countActiveJobs(db).get(printer.id) ?? 0,
    failedJobs = countFailedJobs(db).get(printer.id) ?? 0,
  ) =>
    managedPrinter(
      printer,
      activeJobs,
      failedJobs,
      getHub().isOnline(printer.id),
    );

  /** The route's printer, re-read after a change, as this caller may see it. */
  const reloaded = (request: Request, response: Response) => {
    const printer = getPrinterById(db, printerOf(response).id)!;
    return printerView(
      optionalPrincipal(request),
      printer,
      () => ({
        activeJobs: countActiveJobs(db).get(printer.id) ?? 0,
        failedJobs: countFailedJobs(db).get(printer.id) ?? 0,
        online: getHub().isOnline(printer.id),
      }),
    );
  };

  const absolute = (request: Request, path: string) =>
    new URL(
      path,
      siteUrl ??
        `${request.protocol}://${request.get('host')}`,
    ).toString();

  const queue = async (
    printer: PrinterRow,
    job: Parameters<typeof enqueueJob>[2],
    pdf: Uint8Array,
  ) => {
    const jobId = await enqueueJob(db, jobsDir, job, pdf);
    const hub = getHub();
    hub.publishJob(printer.id, jobId, 'queued');
    hub.dispatch(printer.id);
    return { agentOnline: hub.isOnline(printer.id), jobId };
  };

  /** Reuses a still-usable QR token from the body, or issues one for the requested window. */
  const resolveQrToken = async (
    response: Response,
    { expiresAt, notBefore, token }: QrPosterRequest,
  ): Promise<undefined | UploadToken> => {
    const printer = printerOf(response);
    if (token) {
      // Check at the later of now and the start so codes for a future event are accepted.
      const claims = inspectUploadToken(access, token);
      const checkAt = new Date(
        Math.max(Date.now(), claims?.notBefore.getTime() ?? 0),
      );
      const verified = await verifyUploadToken(
        access,
        printer,
        token,
        checkAt,
      );
      if (
        verified.status !== 'valid' ||
        verified.source !== 'qr'
      ) {
        response.status(400).json({
          error:
            'That QR code is expired, revoked, or not for this printer.',
        });
        return undefined;
      }
      return {
        expiresAt: verified.expiresAt,
        notBefore: verified.notBefore,
        source: 'qr',
        token,
      };
    }
    const now = new Date();
    const start = notBefore ? new Date(notBefore) : now;
    try {
      return await signUploadToken(access, printer, {
        expiresAt: expiresAt
          ? new Date(expiresAt)
          : new Date(
              Math.max(start.getTime(), now.getTime()) +
                DEFAULT_QR_LIFETIME_MS,
            ),
        maxLifetimeMs: access.tokenMaxLifetimeMs,
        notBefore: start,
        now,
        source: 'qr',
      });
    } catch (error) {
      if (!(error instanceof UploadTokenWindowError)) {
        throw error;
      }
      response.status(400).json({ error: error.message });
      return undefined;
    }
  };

  const qrPoster = (
    request: Request,
    printer: PrinterRow,
    issued: UploadToken,
  ) =>
    buildQrPoster({
      date: new Date(),
      displayUrl: absolute(request, printPath(printer)),
      pin: printer.pin ? formatPin(printer.pin) : null,
      printerName: printer.name,
      siteTitle: upload.siteTitle,
      timeZone: upload.timeZone,
      url: absolute(request, printPath(printer, issued.token)),
      validFrom: issued.notBefore,
      validUntil: issued.expiresAt,
    });

  const sendPoster: RequestHandler<
    ParamsDictionary,
    unknown,
    QrPosterRequest
  > = async (request, response) => {
    const printer = printerOf(response);
    const issued = await resolveQrToken(response, request.body);
    if (!issued) {
      return;
    }
    const pdf = await qrPoster(request, printer, issued);
    response
      .set('Cache-Control', 'no-store')
      .set(
        'Content-Disposition',
        `inline; filename="print-${printer.slug}-qr.pdf"`,
      )
      .type('application/pdf')
      .send(Buffer.from(pdf));
  };

  const submitJob: RequestHandler = async (
    request,
    response,
  ) => {
    const printer = printerOf(response);
    let submission: JobSubmission;
    try {
      submission = await readMultipartSubmission(
        request,
        upload,
      );
    } catch (error) {
      response
        .status(
          error instanceof UploadError ? error.status : 400,
        )
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to read upload.',
        });
      return;
    }
    const { documents } = submission;
    if (!documents.length) {
      response.status(400).json({
        error: 'Choose at least one document to print.',
      });
      return;
    }
    if (!copiesValid(submission, upload.maxCopies)) {
      response.status(400).json({
        error: `Copies must be between 1 and ${upload.maxCopies} for each document.`,
      });
      return;
    }
    const title = jobTitle(submission);

    let pdf: Uint8Array;
    try {
      pdf = await combineDocuments(documents, {
        imageDpi: upload.imageDpi,
      });
      if (printer.cover_page) {
        pdf = await addCoverPage(pdf, {
          documents: documents.map((document) => ({
            copies: document.copies,
            titleOrFilename: document.fileName,
          })),
          printerName: printer.name,
          siteTitle: upload.siteTitle,
          submittedAt: new Date(),
          timeZone: upload.timeZone,
          title,
        });
      }
    } catch (error) {
      response.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to process document.',
      });
      return;
    }

    try {
      const queued = await queue(
        printer,
        {
          copies: 1,
          originalName: documents
            .map(({ fileName }) => fileName)
            .join(', '),
          printerId: printer.id,
          submittedBy: submittedBy(principal(request)),
          title,
          uploaderIp: request.ip ?? 'unknown',
        },
        pdf,
      );
      response.status(201).json({ ...queued, title });
    } catch (error) {
      console.error('Could not persist print job', error);
      response
        .status(500)
        .json({ error: 'Unable to queue this print job.' });
    }
  };

  return (
    express
      .Router()
      .param(
        'slug',
        (_request, response, next, slug: string) => {
          const printer = getPrinterBySlug(db, slug);
          if (!printer) {
            response.status(404).json({
              code: 'printer_not_found',
              error: 'Printer not found.',
            });
            return;
          }
          response.locals['printer'] = printer;
          next();
        },
      )

      .get('/', admin, (_request, response) => {
        const activeJobs = countActiveJobs(db);
        const failedJobs = countFailedJobs(db);
        response.json(
          listPrinters(db).map((printer) =>
            summary(
              printer,
              activeJobs.get(printer.id) ?? 0,
              failedJobs.get(printer.id) ?? 0,
            ),
          ),
        );
      })
      .post(
        '/',
        admin,
        validate({ body: PrinterInput }),
        (request, response) => {
          const fields = toPrinterFields(request.body);
          const created = createPrinter(db, fields);
          if (typeof created === 'string') {
            response.status(409).json({ error: created });
            return;
          }
          response.status(201).json({
            agentToken: created.token,
            printer: summary(getPrinterById(db, created.id)!),
            serverUrl,
          });
        },
      )
      // A short-lived token an agent exchanges for its own printer; see POST /api/agent/enroll.
      .post(
        routes.enrollToken.pattern,
        admin,
        (_request, response) => {
          if (!serverUrl) {
            response.status(503).json({
              code: 'site_url_required',
              error:
                'Set SITE_URL (https) on the server to enroll printers from their computers.',
            });
            return;
          }
          const { expiresAt, token } = signEnrollToken(
            access,
            enrollment?.tokenTtlMinutes ??
              DEFAULT_ENROLL_TOKEN_TTL_MINUTES,
          );
          response
            .set('Cache-Control', 'no-store')
            .status(201)
            .json({
              expiresAt: expiresAt.toISOString(),
              serverUrl,
              token,
            } satisfies EnrollTokenResponse);
        },
      )

      // Public details plus the caller's upload access; administrators also get management fields
      // and applications get status.
      .get(
        routes.$slug.pattern,
        authenticate.optional(
          'entraUser',
          'entraApp:Printer.Read',
        ),
        async (request, response) => {
          const printer = printerOf(response);
          const token = await uploadTokenStatus(
            access,
            printer,
            request,
          );
          const signedIn =
            optionalPrincipal(request)?.kind === 'entraUser';
          response.set('Cache-Control', 'no-store').json({
            ...reloaded(request, response),
            access: {
              pinEnabled: printer.pin !== null,
              signedIn,
              token: token?.status ?? null,
              tokenExpiresAt:
                token?.status === 'valid'
                  ? token.expiresAt.toISOString()
                  : null,
            },
            upload: {
              maxCopies: upload.maxCopies,
              maxDocuments: upload.maxDocumentsPerJob,
              maxUploadBytes: upload.maxUploadBytes,
            },
          });
        },
      )
      .patch(
        routes.$slug.pattern,
        admin,
        validate({ body: PrinterInput }),
        (request, response) => {
          const fields = toPrinterFields(request.body);
          const updated = updatePrinter(
            db,
            printerOf(response).id,
            fields,
          );
          if (typeof updated === 'string') {
            response.status(409).json({ error: updated });
            return;
          }
          response.json(reloaded(request, response));
        },
      )
      .delete(
        routes.$slug.pattern,
        admin,
        async (_request, response) => {
          const { id } = printerOf(response);
          const jobIds = deletePrinter(db, id) ?? [];
          getHub().disconnect(id);
          await Promise.all(
            jobIds.map((jobId) =>
              rm(join(jobsDir, `${jobId}.pdf`), { force: true }),
            ),
          );
          response.status(204).end();
        },
      )

      // Exchanges `Authorization: Pin` for a short-lived upload token.
      .post(
        routes.$slug.token.pattern,
        pinFailures,
        pinIssuanceRateLimit(upload),
        authenticate('pin'),
        async (_request, response) => {
          const now = new Date();
          const issued = await signUploadToken(
            access,
            printerOf(response),
            {
              expiresAt: new Date(
                now.getTime() + access.pinTokenTtlMs,
              ),
              maxLifetimeMs: access.pinTokenTtlMs,
              notBefore: now,
              now,
              source: 'pin',
            },
          );
          response
            .status(201)
            .set('Cache-Control', 'no-store')
            .json({
              expiresAt: issued.expiresAt.toISOString(),
              token: issued.token,
            });
        },
      )

      // Credentials are checked before the multipart body is read, so anonymous clients cannot
      // make the server buffer large files.
      .post(
        routes.$slug.jobs.pattern,
        uploadRateLimit(upload),
        pinFailures,
        authenticate(
          'uploadToken',
          'pin',
          'entraUser',
          'entraApp:Printer.PrintJob',
        ),
        submitJob,
      )
      .delete(
        routes.$slug.jobs.pattern,
        admin,
        async (_request, response) => {
          const printer = printerOf(response);
          const jobIds = deletePrinterJobs(db, printer.id);
          await Promise.all(
            jobIds.map((jobId) =>
              rm(join(jobsDir, `${jobId}.pdf`), { force: true }),
            ),
          );
          getHub().publishJobsDeleted(printer.id, jobIds.length);
          response.json({
            deleted: jobIds.length,
            printer: summary(printer, 0),
          });
        },
      )

      // Requeues failed jobs whose document is still on disk.
      .post(
        routes.$slug.jobs.retry.pattern,
        admin,
        async (request, response) => {
          const printer = printerOf(response);
          const failed = getFailedJobIds(db, printer.id);
          const hasFile = await Promise.all(
            failed.map((jobId) =>
              fileAccess(join(jobsDir, `${jobId}.pdf`)).then(
                () => true,
                () => false,
              ),
            ),
          );
          expireFailedJobs(
            db,
            printer.id,
            failed.filter((_, index) => !hasFile[index]),
          );
          const retried = requeueFailedJobs(
            db,
            printer.id,
            failed.filter((_, index) => hasFile[index]),
          );
          const hub = getHub();
          retried.forEach((jobId) =>
            hub.publishJob(printer.id, jobId, 'queued'),
          );
          hub.dispatch(printer.id);
          response.json({
            printer: reloaded(request, response),
            retried: retried.length,
          });
        },
      )

      .get(
        routes.$slug.qrPdf.pattern,
        admin,
        validate({ body: QrPosterRequest.default({}) }),
        sendPoster,
      )
      .post(
        routes.$slug.qrPdf.pattern,
        admin,
        validate({ body: QrPosterRequest.default({}) }),
        sendPoster,
      )
      .post(
        routes.$slug.qrToken.pattern,
        admin,
        validate({ body: QrPosterRequest.default({}) }),
        async (request, response) => {
          const issued = await resolveQrToken(
            response,
            request.body,
          );
          if (!issued) {
            return;
          }
          const path = printPath(
            printerOf(response),
            issued.token,
          );
          response
            .set('Cache-Control', 'no-store')
            .status(201)
            .json({
              expiresAt: issued.expiresAt.toISOString(),
              notBefore: issued.notBefore.toISOString(),
              path,
              token: issued.token,
              url: absolute(request, path),
            });
        },
      )
      .post(
        routes.$slug.qrPrint.pattern,
        authenticate('entraUser', 'entraApp:Printer.PrintFlyer'),
        validate({ body: QrPosterRequest.default({}) }),
        async (request, response) => {
          const printer = printerOf(response);
          const issued = await resolveQrToken(
            response,
            request.body,
          );
          if (!issued) {
            return;
          }
          const queued = await queue(
            printer,
            {
              copies: 1,
              originalName: `print-${printer.slug}-qr.pdf`,
              printerId: printer.id,
              submittedBy: submittedBy(principal(request)),
              title: `QR info sheet - ${printer.name}`,
              uploaderIp: request.ip ?? '',
            },
            await qrPoster(request, printer, issued),
          );
          response.status(202).json(queued);
        },
      )
      .post(
        routes.$slug.qrEpoch.pattern,
        admin,
        (request, response) => {
          bumpQrEpoch(db, printerOf(response).id);
          response.json(reloaded(request, response));
        },
      )

      // Applications may rotate or disable the PIN but, via `reloaded`, never see it.
      .post(
        routes.$slug.pin.pattern,
        managePin,
        (request, response) => {
          setPrinterPin(
            db,
            printerOf(response).id,
            generatePin(),
          );
          response.json(reloaded(request, response));
        },
      )
      .delete(
        routes.$slug.pin.pattern,
        managePin,
        (request, response) => {
          setPrinterPin(db, printerOf(response).id, null);
          response.json(reloaded(request, response));
        },
      )

      .post(
        routes.$slug.agentToken.pattern,
        admin,
        (_request, response) => {
          const printer = printerOf(response);
          const agentToken = rotatePrinterToken(db, printer.id)!;
          getHub().disconnect(printer.id);
          response.json({
            agentToken,
            printer: summary(printer),
            serverUrl,
          });
        },
      )
  );
}
