import express, { type RequestHandler } from 'express';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_ERROR_LENGTH } from '@uwacwy/print-shared';
import {
  getJobForPrinter,
  getPrinterByToken,
  reportJob,
  type PrintDatabase,
  type PrinterRow,
} from '../lib/database/database.js';
import { bearerToken } from '../realtime/agent-gateway';
import type { AgentHub } from '../realtime/agent-hub';

export interface AgentApiOptions {
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
}

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireAgent =
  (db: PrintDatabase): RequestHandler =>
  (request, response, next) => {
    const token = bearerToken(request.header('authorization'));
    const printer = token ? getPrinterByToken(db, token) : undefined;
    if (!printer) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    response.locals['printer'] = printer;
    next();
  };

/** HTTP side of the agent protocol; mounted at `/agent` to match the shared path helpers. */
export default ({ db, jobsDir, getHub }: AgentApiOptions) =>
  express
    .Router()
    .use(requireAgent(db))
    .get('/jobs/:id/file', async (request, response, next) => {
      const printer = response.locals['printer'] as PrinterRow;
      const job = JOB_ID_PATTERN.test(request.params.id)
        ? getJobForPrinter(db, printer.id, request.params.id)
        : undefined;
      if (!job || job.status !== 'printing') {
        response.status(404).json({ error: 'Job not found' });
        return;
      }
      const filePath = join(jobsDir, `${job.id}.pdf`);
      try {
        const { size } = await stat(filePath);
        response.writeHead(200, {
          'content-type': 'application/pdf',
          'content-length': size,
          'content-disposition': `attachment; filename="${job.id}.pdf"`,
          'cache-control': 'no-store',
        });
        createReadStream(filePath).on('error', next).pipe(response);
      } catch {
        response.status(404).json({ error: 'Job file not found' });
      }
    })
    .post('/jobs/:id/status', async (request, response) => {
      const printer = response.locals['printer'] as PrinterRow;
      const body: unknown = request.body;
      const status =
        typeof body === 'object' && body !== null && 'status' in body ? body.status : undefined;
      if (status !== 'printed' && status !== 'failed') {
        response.status(400).json({ error: 'Invalid status report' });
        return;
      }
      const errorText =
        status === 'failed' && typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error).slice(0, MAX_ERROR_LENGTH)
          : undefined;
      const jobId = request.params.id;
      if (!JOB_ID_PATTERN.test(jobId) || !reportJob(db, printer.id, jobId, status, errorText)) {
        response.status(404).json({ error: 'Job not found or already completed' });
        return;
      }
      await rm(join(jobsDir, `${jobId}.pdf`), { force: true });
      getHub().publishJob(printer.id, jobId, status);
      response.json({ accepted: true });
    });
