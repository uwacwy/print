import express, { type RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type AugmentedRequest } from 'express-rate-limit';
import { addCoverPage } from '../lib/cover-page/cover-page.js';
import { getPrinterBySlug, pinMatches } from '../lib/database/database.js';
import { combineDocuments } from '../lib/document/document.js';
import { enqueueJob } from '../lib/jobs.js';
import { signUploadToken } from '../lib/upload-token/upload-token.js';
import { readMultipartSubmission, requireSameOrigin } from './helpers.js';
import { requireUploadToken, uploadAccess } from './upload-access.js';
import { UploadApiOptions, JobSource, JobSubmission } from './types.js';

export const UPLOAD_HEADER = 'x-print-upload';

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function createJobHandler(options: UploadApiOptions, source: JobSource): RequestHandler {
  const { db, jobsDir, getHub, upload } = options;

  return async (request, response) => {
    const { printer } = uploadAccess(response);

    let submission: JobSubmission;
    try {
      submission = await source.read(request, upload);
    } catch (error) {
      const status = error instanceof UploadError ? error.status : 400;
      response
        .status(status)
        .json({ error: error instanceof Error ? error.message : 'Unable to read upload.' });
      return;
    }

    const { documents } = submission;
    if (!documents.length) {
      response.status(400).json({ error: 'Choose at least one document to print.' });
      return;
    }

    if (
      documents.some(
        ({ copies }) => !Number.isInteger(copies) || copies < 1 || copies > upload.maxCopies,
      )
    ) {
      response
        .status(400)
        .json({ error: `Copies must be between 1 and ${upload.maxCopies} for each document.` });
      return;
    }

    const submittedTitle = (submission.title ?? '').trim();
    const filenameTitle =
      documents.length === 1
        ? documents[0]!.fileName.replace(/\.[^.]+$/, '').trim()
        : `${documents.length} documents`;
    const title = (submittedTitle || filenameTitle || 'Print job').slice(0, 120);

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
      response
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Unable to process document.' });
      return;
    }

    let jobId: string;
    try {
      jobId = await enqueueJob(
        db,
        jobsDir,
        {
          printerId: printer.id,
          title,
          copies: 1,
          originalName: documents.map(({ fileName }) => fileName).join(', '),
          submittedBy: source.submittedBy(response),
          uploaderIp: request.ip ?? 'unknown',
        },
        pdf,
      );
    } catch (error) {
      console.error('Could not persist print job', error);
      response.status(500).json({ error: 'Unable to queue this print job.' });
      return;
    }

    const hub = getHub();
    hub.publishJob(printer.id, jobId, 'queued');
    hub.dispatch(printer.id);
    response.status(201).json({ jobId, title, agentOnline: hub.isOnline(printer.id) });
  };
}

const minutesUntil = (request: express.Request) => {
  const resetTime = (request as AugmentedRequest)['rateLimit']?.resetTime;
  return Math.max(1, Math.ceil(((resetTime?.getTime() ?? Date.now()) - Date.now()) / 60_000));
};

/** Exchanges a printer PIN for a short-lived upload token. */
function createPinExchangeHandler({ db, upload }: UploadApiOptions): RequestHandler {
  const { access } = upload;
  return async (request, response) => {
    const printer = getPrinterBySlug(db, String(request.params['slug']));
    if (!printer) {
      response.status(404).json({ error: 'Printer not found.' });
      return;
    }
    if (!printer.pin) {
      response.status(403).json({
        code: 'pin_disabled',
        error: 'This printer does not accept a PIN. Scan the QR code posted at the printer.',
      });
      return;
    }
    const body: unknown = request.body;
    const pin = typeof body === 'object' && body !== null && 'pin' in body ? body.pin : undefined;
    if (!pinMatches(printer, pin)) {
      response.status(401).json({ code: 'pin_incorrect', error: 'That PIN is not correct.' });
      return;
    }
    const now = new Date();
    const issued = await signUploadToken(access, printer, {
      source: 'pin',
      notBefore: now,
      expiresAt: new Date(now.getTime() + access.pinTokenTtlMs),
      maxLifetimeMs: access.pinTokenTtlMs,
      now,
    });
    response
      .status(201)
      .set('Cache-Control', 'no-store')
      .json({ token: issued.token, expiresAt: issued.expiresAt.toISOString() });
  };
}

export const createUploadRouter = (options: UploadApiOptions) => {
  const { access } = options.upload;
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: options.upload.uploadsPerMinute,
    ipv6Subnet: access.ipv6Subnet,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many uploads. Wait a minute and try again.' },
  });

  // Counts only wrong PINs, per client and printer, to stop guessing.
  const pinFailureWindowMs = 15 * 60_000;
  const pinFailures = rateLimit({
    windowMs: pinFailureWindowMs,
    limit: access.pinMaxFailures,
    keyGenerator: (request) =>
      `${ipKeyGenerator(request.ip ?? '', access.ipv6Subnet)}|${String(request.params['slug'])}`,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_request, response) => response.statusCode !== 401,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (request, response) =>
      response.status(429).json({
        code: 'pin_locked',
        error: `Too many incorrect PINs. Try again in ${minutesUntil(request)} minutes.`,
      }),
  });

  // Counts only issued tokens, per client across all printers.
  const pinIssuance = rateLimit({
    windowMs: access.pinTokenIntervalMs,
    limit: 1,
    ipv6Subnet: access.ipv6Subnet,
    skipFailedRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (request, response) => {
      const minutes = minutesUntil(request);
      response.status(429).json({
        code: 'pin_rate_limited',
        error: `A print code was already issued to this device. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      });
    },
  });

  return express
    .Router()
    .post(
      '/:slug/token',
      requireSameOrigin,
      express.json({ limit: '1kb' }),
      pinFailures,
      pinIssuance,
      createPinExchangeHandler(options),
    )
    .post(
      '/:slug/jobs',
      limiter,
      requireSameOrigin,
      requireUploadToken(options.db, access),
      createJobHandler(options, {
        // Records which code was used: its source and ISO 8601 validity interval.
        submittedBy: (response) => {
          const { source, notBefore, expiresAt } = uploadAccess(response);
          return `${source}:${notBefore.toISOString()}/${expiresAt.toISOString()}`;
        },
        read: readMultipartSubmission,
      }),
    );
};

export default createUploadRouter;
