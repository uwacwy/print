import express, {
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { addCoverPage } from '../../helpers/pdf/cover-page/cover-page';
import {
  bumpQrEpoch,
  countActiveJobs,
  createPrinter,
  deletePrinter,
  deletePrinterJobs,
  getPrinterById,
  getPrinterBySlug,
  listPrinters,
  rotatePrinterToken,
  setPrinterPin,
  updatePrinter,
  type PrintDatabase,
  type PrinterRow,
} from '../../helpers/database/database';
import { combineDocuments } from '../../helpers/pdf/document/document';
import { enqueueJob } from '../../helpers/database/jobs';
import { buildQrPoster } from '../../helpers/pdf/qr-poster/qr-poster';
import {
  inspectUploadToken,
  signUploadToken,
  UploadTokenWindowError,
  verifyUploadToken,
  type UploadToken,
} from '../../middleware/auth/upload-token/upload-token';
import {
  formatPin,
  generatePin,
} from '../../middleware/auth/pin/pin';
import type { AgentHub } from '../../sockets/agent-hub/agent-hub';
import type { UploadConfig } from '../../../server-config';
import { UploadError } from '../../helpers/errors';
import { copiesValid, jobTitle } from '../../helpers/jobs';
import {
  readMultipartSubmission,
  type JobSubmission,
} from '../../helpers/multipart';
import {
  managedPrinter,
  printPath,
  publicPrinter,
  validatePrinterInput,
} from '../../helpers/printers';
import type { Authenticate } from '../../middleware/auth/passport/passport';
import {
  optionalPrincipal,
  principal,
  submittedBy,
} from '../../middleware/auth/principal';
import { uploadTokenStatus } from '../../middleware/auth/upload-token/upload-token.strategy';
import {
  pinFailureRateLimit,
  pinIssuanceRateLimit,
  uploadRateLimit,
} from '../../middleware/rate-limits/rate-limits';
import { requireSameOrigin } from '../../middleware/same-origin/same-origin';

export interface PrintersRouterOptions {
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  upload: UploadConfig;
  authenticate: Authenticate;
  /** Canonical origin for upload links on QR posters; falls back to the request origin. */
  publicUrl?: URL;
}

const DEFAULT_QR_LIFETIME_MS = 24 * 3_600_000;

/** Either reuse an issued QR token (so a tested link matches the poster) or issue one for a window. */
const qrTokenInput = z
  .object({
    token: z.string().min(1).optional(),
    notBefore: z.iso.datetime({ offset: true }).optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .optional()
  .default({});

/** The printer loaded by the `:slug` parameter handler. */
const printerOf = (response: Response) =>
  response.locals['printer'] as PrinterRow;

/** Every `/printers` route; each declares the credentials it accepts. */
export default function printersRouter({
  db,
  jobsDir,
  getHub,
  upload,
  authenticate,
  publicUrl,
}: PrintersRouterOptions) {
  const { access } = upload;
  const admin = authenticate('entraUser');
  const pinFailures = pinFailureRateLimit(upload);

  const summary = (
    printer: PrinterRow,
    activeJobs = countActiveJobs(db).get(printer.id) ?? 0,
  ) =>
    managedPrinter(
      printer,
      activeJobs,
      getHub().isOnline(printer.id),
    );
  const reloaded = (response: Response) =>
    summary(getPrinterById(db, printerOf(response).id)!);
  const absolute = (request: Request, path: string) =>
    new URL(
      path,
      publicUrl ?? `${request.protocol}://${request.get('host')}`,
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
    return { jobId, agentOnline: hub.isOnline(printer.id) };
  };

  /** Reuses a still-usable QR token from the body, or issues one for the requested window. */
  const resolveQrToken = async (
    request: Request,
    response: Response,
  ): Promise<UploadToken | undefined> => {
    const printer = printerOf(response);
    const parsed = qrTokenInput.safeParse(request.body ?? undefined);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: 'Invalid QR code request.' });
      return undefined;
    }
    const { token, notBefore, expiresAt } = parsed.data;
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
      if (verified.status !== 'valid' || verified.source !== 'qr') {
        response.status(400).json({
          error:
            'That QR code is expired, revoked, or not for this printer.',
        });
        return undefined;
      }
      return {
        token,
        source: 'qr',
        notBefore: verified.notBefore,
        expiresAt: verified.expiresAt,
      };
    }
    const now = new Date();
    const start = notBefore ? new Date(notBefore) : now;
    try {
      return await signUploadToken(access, printer, {
        source: 'qr',
        notBefore: start,
        expiresAt: expiresAt
          ? new Date(expiresAt)
          : new Date(
              Math.max(start.getTime(), now.getTime()) +
                DEFAULT_QR_LIFETIME_MS,
            ),
        maxLifetimeMs: access.tokenMaxLifetimeMs,
        now,
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
      siteTitle: upload.siteTitle,
      printerName: printer.name,
      url: absolute(request, printPath(printer, issued.token)),
      displayUrl: absolute(request, printPath(printer)),
      date: new Date(),
      timeZone: upload.timeZone,
      validFrom: issued.notBefore,
      validUntil: issued.expiresAt,
      pin: printer.pin ? formatPin(printer.pin) : null,
    });

  const sendPoster: RequestHandler = async (request, response) => {
    const printer = printerOf(response);
    const issued = await resolveQrToken(request, response);
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

  const submitJob: RequestHandler = async (request, response) => {
    const printer = printerOf(response);
    let submission: JobSubmission;
    try {
      submission = await readMultipartSubmission(request, upload);
    } catch (error) {
      response
        .status(error instanceof UploadError ? error.status : 400)
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
      response
        .status(400)
        .json({ error: 'Choose at least one document to print.' });
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
      pdf = await combineDocuments(documents);
      if (printer.cover_page) {
        pdf = await addCoverPage(pdf, {
          siteTitle: upload.siteTitle,
          printerName: printer.name,
          title,
          submittedAt: new Date(),
          timeZone: upload.timeZone,
          documents: documents.map((document) => ({
            titleOrFilename: document.fileName,
            copies: document.copies,
          })),
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
          printerId: printer.id,
          title,
          copies: 1,
          originalName: documents
            .map(({ fileName }) => fileName)
            .join(', '),
          submittedBy: submittedBy(principal(request)),
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
      .param('slug', (_request, response, next, slug: string) => {
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
      })

      .get('/', admin, (_request, response) => {
        const activeJobs = countActiveJobs(db);
        response.json(
          listPrinters(db).map((printer) =>
            summary(printer, activeJobs.get(printer.id) ?? 0),
          ),
        );
      })
      .post('/', admin, (request, response) => {
        const parsed = validatePrinterInput(request.body);
        if ('error' in parsed) {
          response.status(400).json(parsed);
          return;
        }
        const created = createPrinter(db, parsed.fields);
        if (typeof created === 'string') {
          response.status(409).json({ error: created });
          return;
        }
        response.status(201).json({
          printer: summary(getPrinterById(db, created.id)!),
          agentToken: created.token,
        });
      })

      // Public details plus the caller's upload access; administrators also get management fields.
      .get(
        '/:slug',
        authenticate.optional('entraUser'),
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
            ...(signedIn
              ? summary(printer)
              : publicPrinter(printer)),
            access: {
              signedIn,
              pinEnabled: printer.pin !== null,
              token: token?.status ?? null,
              tokenExpiresAt:
                token?.status === 'valid'
                  ? token.expiresAt.toISOString()
                  : null,
            },
            upload: {
              maxDocuments: upload.maxDocumentsPerJob,
              maxCopies: upload.maxCopies,
              maxUploadBytes: upload.maxUploadBytes,
            },
          });
        },
      )
      .patch('/:slug', admin, (request, response) => {
        const parsed = validatePrinterInput(request.body);
        if ('error' in parsed) {
          response.status(400).json(parsed);
          return;
        }
        const updated = updatePrinter(
          db,
          printerOf(response).id,
          parsed.fields,
        );
        if (typeof updated === 'string') {
          response.status(409).json({ error: updated });
          return;
        }
        response.json(reloaded(response));
      })
      .delete('/:slug', admin, async (_request, response) => {
        const { id } = printerOf(response);
        const jobIds = deletePrinter(db, id) ?? [];
        getHub().disconnect(id);
        await Promise.all(
          jobIds.map((jobId) =>
            rm(join(jobsDir, `${jobId}.pdf`), { force: true }),
          ),
        );
        response.status(204).end();
      })

      // Exchanges `Authorization: Pin` for a short-lived upload token.
      .post(
        '/:slug/token',
        requireSameOrigin,
        pinFailures,
        pinIssuanceRateLimit(upload),
        authenticate('pin'),
        async (_request, response) => {
          const now = new Date();
          const issued = await signUploadToken(
            access,
            printerOf(response),
            {
              source: 'pin',
              notBefore: now,
              expiresAt: new Date(
                now.getTime() + access.pinTokenTtlMs,
              ),
              maxLifetimeMs: access.pinTokenTtlMs,
              now,
            },
          );
          response
            .status(201)
            .set('Cache-Control', 'no-store')
            .json({
              token: issued.token,
              expiresAt: issued.expiresAt.toISOString(),
            });
        },
      )

      // Credentials are checked before the multipart body is read, so anonymous clients cannot
      // make the server buffer large files.
      .post(
        '/:slug/jobs',
        uploadRateLimit(upload),
        requireSameOrigin,
        pinFailures,
        authenticate('uploadToken', 'pin', 'entraUser'),
        submitJob,
      )
      .delete('/:slug/jobs', admin, async (_request, response) => {
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
      })

      .get('/:slug/qr.pdf', admin, sendPoster)
      .post('/:slug/qr.pdf', admin, sendPoster)
      .post('/:slug/qr-token', admin, async (request, response) => {
        const issued = await resolveQrToken(request, response);
        if (!issued) {
          return;
        }
        const path = printPath(printerOf(response), issued.token);
        response
          .set('Cache-Control', 'no-store')
          .status(201)
          .json({
            token: issued.token,
            path,
            url: absolute(request, path),
            notBefore: issued.notBefore.toISOString(),
            expiresAt: issued.expiresAt.toISOString(),
          });
      })
      .post('/:slug/qr-print', admin, async (request, response) => {
        const printer = printerOf(response);
        const issued = await resolveQrToken(request, response);
        if (!issued) {
          return;
        }
        const queued = await queue(
          printer,
          {
            printerId: printer.id,
            title: `QR info sheet - ${printer.name}`,
            copies: 1,
            originalName: `print-${printer.slug}-qr.pdf`,
            submittedBy: submittedBy(principal(request)),
            uploaderIp: request.ip ?? '',
          },
          await qrPoster(request, printer, issued),
        );
        response.status(202).json(queued);
      })
      .post('/:slug/qr-epoch', admin, (_request, response) => {
        bumpQrEpoch(db, printerOf(response).id);
        response.json(reloaded(response));
      })

      .post('/:slug/pin', admin, (_request, response) => {
        setPrinterPin(db, printerOf(response).id, generatePin());
        response.json(reloaded(response));
      })
      .delete('/:slug/pin', admin, (_request, response) => {
        setPrinterPin(db, printerOf(response).id, null);
        response.json(reloaded(response));
      })

      .post('/:slug/agent-token', admin, (_request, response) => {
        const printer = printerOf(response);
        const agentToken = rotatePrinterToken(db, printer.id)!;
        getHub().disconnect(printer.id);
        response.json({ printer: summary(printer), agentToken });
      })
  );
}
