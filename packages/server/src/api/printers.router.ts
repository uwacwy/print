import express, { type Request, type Response } from 'express';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bumpQrEpoch,
  countActiveJobs,
  createPrinter,
  deletePrinter,
  deletePrinterJobs,
  formatPin,
  generatePin,
  getPrinterById,
  getPrinterBySlug,
  listPrinters,
  rotatePrinterToken,
  setPrinterPin,
  updatePrinter,
  validatePrinterFields,
  type PrintDatabase,
  type PrinterRow,
} from '../lib/database/database.js';
import { enqueueJob } from '../lib/jobs.js';
import { buildQrPoster } from '../lib/qr-poster/qr-poster.js';
import {
  inspectUploadToken,
  signUploadToken,
  UploadTokenWindowError,
  verifyUploadToken,
  type UploadToken,
} from '../lib/upload-token/upload-token.js';
import { z } from 'zod';
import { uploadTokenStatus } from './upload-access.js';
import type { UploadConfig } from '../server-config';
import type { AgentHub } from '../realtime/agent-hub';

export interface PrinterApiOptions {
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  upload: UploadConfig;
  /** Canonical origin for upload links on QR posters; falls back to the request origin. */
  publicUrl?: URL;
}

const printerInput = z.object({
  slug: z.string(),
  name: z.string(),
  queue: z.string(),
  coverPage: z.boolean().optional().default(false),
});

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

function parseId(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

function publicPrinter(printer: PrinterRow) {
  return {
    slug: printer.slug,
    name: printer.name,
    coverPage: printer.cover_page === 1,
  };
}

function adminPrinter(printer: PrinterRow, activeJobs: number, online: boolean) {
  return {
    ...publicPrinter(printer),
    id: printer.id,
    queue: printer.queue,
    pin: printer.pin ? formatPin(printer.pin) : null,
    qrEpoch: printer.qr_epoch,
    lastSeenAt: printer.last_seen_at,
    activeJobs,
    online,
  };
}

function validateInput(input: unknown) {
  const parsed = printerInput.safeParse(input);
  if (!parsed.success) return { error: 'Invalid printer fields.' } as const;
  const fields = validatePrinterFields({
    slug: parsed.data.slug,
    name: parsed.data.name,
    queue: parsed.data.queue,
    cover_page: parsed.data.coverPage,
  });
  return typeof fields === 'string' ? ({ error: fields } as const) : ({ fields } as const);
}

export default ({ db, upload }: PrinterApiOptions) =>
  express.Router().get('/:slug', async (request, response) => {
    const printer = getPrinterBySlug(db, request.params.slug);
    if (!printer) {
      response.status(404).json({ error: 'printer_not_found' });
      return;
    }
    const token = await uploadTokenStatus(
      upload.access,
      printer,
      request.headers.authorization,
    );
    response.set('Cache-Control', 'no-store').json({
      ...publicPrinter(printer),
      access: {
        pinEnabled: printer.pin !== null,
        token: token?.status ?? null,
        tokenExpiresAt: token?.status === 'valid' ? token.expiresAt.toISOString() : null,
      },
      upload: {
        maxDocuments: upload.maxDocumentsPerJob,
        maxCopies: upload.maxCopies,
        maxUploadBytes: upload.maxUploadBytes,
      },
    });
  });

export const adminPrintersRouter = ({
  db,
  jobsDir,
  getHub,
  upload,
  publicUrl,
}: PrinterApiOptions) => {
  const summary = (printer: PrinterRow, activeJobs = countActiveJobs(db).get(printer.id) ?? 0) =>
    adminPrinter(printer, activeJobs, getHub().isOnline(printer.id));

  const findPrinter = (request: Request, response: Response): PrinterRow | undefined => {
    const id = parseId(String(request.params['id']));
    const printer = id === undefined ? undefined : getPrinterById(db, id);
    if (!printer) response.status(404).json({ error: 'printer_not_found' });
    return printer;
  };

  const printPath = (printer: PrinterRow, token?: string) =>
    `/print/${encodeURIComponent(printer.slug)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const absolute = (request: Request, path: string) =>
    new URL(path, publicUrl ?? `${request.protocol}://${request.get('host')}`).toString();

  /** Reuses a still-usable QR token from the body, or issues one for the requested window. */
  const resolveQrToken = async (
    request: Request,
    response: Response,
    printer: PrinterRow,
  ): Promise<UploadToken | undefined> => {
    const parsed = qrTokenInput.safeParse(request.body ?? undefined);
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid QR code request.' });
      return undefined;
    }
    const { token, notBefore, expiresAt } = parsed.data;
    if (token) {
      // Check at the later of now and the start so codes for a future event are accepted.
      const claims = inspectUploadToken(upload.access, token);
      const checkAt = new Date(Math.max(Date.now(), claims?.notBefore.getTime() ?? 0));
      const verified = await verifyUploadToken(upload.access, printer, token, checkAt);
      if (verified.status !== 'valid' || verified.source !== 'qr') {
        response.status(400).json({ error: 'That QR code is expired, revoked, or not for this printer.' });
        return undefined;
      }
      return { token, source: 'qr', notBefore: verified.notBefore, expiresAt: verified.expiresAt };
    }
    const now = new Date();
    const start = notBefore ? new Date(notBefore) : now;
    try {
      return await signUploadToken(upload.access, printer, {
        source: 'qr',
        notBefore: start,
        expiresAt: expiresAt
          ? new Date(expiresAt)
          : new Date(Math.max(start.getTime(), now.getTime()) + DEFAULT_QR_LIFETIME_MS),
        maxLifetimeMs: upload.access.tokenMaxLifetimeMs,
        now,
      });
    } catch (error) {
      if (!(error instanceof UploadTokenWindowError)) throw error;
      response.status(400).json({ error: error.message });
      return undefined;
    }
  };

  const qrPoster = (request: Request, printer: PrinterRow, issued: UploadToken) =>
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

  const sendPoster = async (request: Request, response: Response) => {
    const printer = findPrinter(request, response);
    if (!printer) return;
    const issued = await resolveQrToken(request, response, printer);
    if (!issued) return;
    const pdf = await qrPoster(request, printer, issued);
    response
      .set('Cache-Control', 'no-store')
      .set('Content-Disposition', `inline; filename="print-${printer.slug}-qr.pdf"`)
      .type('application/pdf')
      .send(Buffer.from(pdf));
  };

  return express
    .Router()
    .get('/', (_request, response) => {
      const activeJobs = countActiveJobs(db);
      response.json(
        listPrinters(db).map((printer) => summary(printer, activeJobs.get(printer.id) ?? 0)),
      );
    })
    .post('/', (request, response) => {
      const parsed = validateInput(request.body);
      if ('error' in parsed) {
        response.status(400).json(parsed);
        return;
      }
      const created = createPrinter(db, parsed.fields);
      if (typeof created === 'string') {
        response.status(409).json({ error: created });
        return;
      }
      const printer = getPrinterById(db, created.id);
      response.status(201).json({
        printer: summary(printer!),
        agentToken: created.token,
      });
    })
    .get('/:id', (request, response) => {
      const id = parseId(request.params.id);
      const printer = id === undefined ? undefined : getPrinterById(db, id);
      if (!printer) {
        response.status(404).json({ error: 'printer_not_found' });
        return;
      }
      response.json(summary(printer));
    })
    .patch('/:id', (request, response) => {
      const id = parseId(request.params.id);
      const printer = id === undefined ? undefined : getPrinterById(db, id);
      if (!printer) {
        response.status(404).json({ error: 'printer_not_found' });
        return;
      }
      const parsed = validateInput(request.body);
      if ('error' in parsed) {
        response.status(400).json(parsed);
        return;
      }
      const updated = updatePrinter(db, printer.id, parsed.fields);
      if (typeof updated === 'string') {
        response.status(409).json({ error: updated });
        return;
      }
      const saved = getPrinterById(db, printer.id)!;
      response.json(summary(saved));
    })
    .get('/:id/qr.pdf', sendPoster)
    .post('/:id/qr.pdf', sendPoster)
    .post('/:id/qr-token', async (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      const issued = await resolveQrToken(request, response, printer);
      if (!issued) return;
      const path = printPath(printer, issued.token);
      response.set('Cache-Control', 'no-store').status(201).json({
        token: issued.token,
        path,
        url: absolute(request, path),
        notBefore: issued.notBefore.toISOString(),
        expiresAt: issued.expiresAt.toISOString(),
      });
    })
    .post('/:id/qr-epoch', (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      bumpQrEpoch(db, printer.id);
      response.json(summary(getPrinterById(db, printer.id)!));
    })
    .post('/:id/pin', (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      setPrinterPin(db, printer.id, generatePin());
      response.json(summary(getPrinterById(db, printer.id)!));
    })
    .delete('/:id/pin', (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      setPrinterPin(db, printer.id, null);
      response.json(summary(getPrinterById(db, printer.id)!));
    })
    .post('/:id/qr-print', async (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      const issued = await resolveQrToken(request, response, printer);
      if (!issued) return;
      const admin = response.locals['entraAdmin'] as { id?: string } | undefined;
      const jobId = await enqueueJob(
        db,
        jobsDir,
        {
          printerId: printer.id,
          title: `QR info sheet - ${printer.name}`,
          copies: 1,
          originalName: `print-${printer.slug}-qr.pdf`,
          submittedBy: admin?.id ?? null,
          uploaderIp: request.ip ?? '',
        },
        await qrPoster(request, printer, issued),
      );
      const hub = getHub();
      hub.publishJob(printer.id, jobId, 'queued');
      hub.dispatch(printer.id);
      response.status(202).json({ jobId, agentOnline: hub.isOnline(printer.id) });
    })
    .post('/:id/token', (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      const agentToken = rotatePrinterToken(db, printer.id);
      if (!agentToken) {
        response.status(404).json({ error: 'printer_not_found' });
        return;
      }
      getHub().disconnect(printer.id, 'Token rotated');
      response.json({ printer: summary(printer), agentToken });
    })
    .delete('/:id/jobs', async (request, response) => {
      const printer = findPrinter(request, response);
      if (!printer) return;
      const jobIds = deletePrinterJobs(db, printer.id);
      await Promise.all(jobIds.map((jobId) => rm(join(jobsDir, `${jobId}.pdf`), { force: true })));
      getHub().publishJobsDeleted(printer.id, jobIds.length);
      response.json({ deleted: jobIds.length, printer: summary(printer, 0) });
    })
    .delete('/:id', async (request, response) => {
      const id = parseId(request.params.id);
      const jobIds = id === undefined ? undefined : deletePrinter(db, id);
      if (!jobIds) {
        response.status(404).json({ error: 'printer_not_found' });
        return;
      }
      getHub().disconnect(id!, 'Printer deleted');
      await Promise.all(jobIds.map((jobId) => rm(join(jobsDir, `${jobId}.pdf`), { force: true })));
      response.status(204).end();
    });
};
