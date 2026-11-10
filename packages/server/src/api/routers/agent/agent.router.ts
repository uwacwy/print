import {
  MAX_ERROR_LENGTH,
  type EnrollResponse,
} from '@uwacwy/print-shared';
import express from 'express';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createRouting } from 'ts-routes';
import { z } from 'zod';
import { agents } from '../../../shared/routes/api.agents.routes';
import {
  createPrinter,
  getJobForPrinter,
  getPrinterById,
  reportJob,
  updatePrinter,
  validatePrinterFields,
  type PrintDatabase,
  type PrinterRow,
} from '../../helpers/database/database';
import { validatePrinterInput } from '../../helpers/printers';
import type { UploadConfig } from '../../helpers/server-config/server-config';
import { createAuthenticate } from '../../middleware/auth/passport/passport';
import { principal } from '../../middleware/auth/principal';
import { enrollRateLimit } from '../../middleware/rate-limits/rate-limits';
import type { AgentHub } from '../../sockets/agent-hub/agent-hub';

export interface AgentApiOptions {
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
  /** Its token key also signs enrollment tokens. */
  upload: UploadConfig;
}

const queueUpdate = z.object({ queue: z.string() });

const agentView = ({ slug, name, queue }: PrinterRow) => ({
  slug,
  name,
  queue,
});

const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const agentPrinter = (request: express.Request) => {
  const who = principal(request);
  if (who.kind !== 'agent') {
    throw new Error('Expected an agent principal.');
  }
  return who.printer;
};

const $ = createRouting(agents);

/** HTTP side of the agent protocol; mounted at `/api/agent` to match the shared path helpers. */
export default ({
  db,
  jobsDir,
  getHub,
  upload,
}: AgentApiOptions) => {
  const authenticate = createAuthenticate({
    db,
    enrollToken: upload.access,
  });
  const agent = authenticate('agentToken');
  return (
    express
      .Router()

      // An agent holding an enrollment token creates its own printer and receives its agent token.
      .post(
        $.enroll.pattern,
        enrollRateLimit(upload),
        authenticate('enrollToken'),
        (request, response) => {
          const parsed = validatePrinterInput(request.body);
          if ('error' in parsed) {
            response.status(400).json(parsed);
            return;
          }
          const created = createPrinter(db, parsed.fields);
          if (typeof created === 'string') {
            response
              .status(409)
              .json({ code: 'slug_taken', error: created });
            return;
          }
          response.status(201).json({
            printer: agentView(getPrinterById(db, created.id)!),
            agentToken: created.token,
          } satisfies EnrollResponse);
        },
      )

      // Agents report the queue they actually print to, so the admin list reflects the host.
      .patch($.printer.pattern, agent, (request, response) => {
        const printer = agentPrinter(request);
        const body = queueUpdate.safeParse(request.body);
        const fields = body.success
          ? validatePrinterFields({
              slug: printer.slug,
              name: printer.name,
              queue: body.data.queue,
              cover_page: printer.cover_page === 1 ? 'true' : '',
            })
          : 'Invalid printer fields.';
        if (typeof fields === 'string') {
          response.status(400).json({ error: fields });
          return;
        }
        updatePrinter(db, printer.id, fields);
        response.json(agentView(getPrinterById(db, printer.id)!));
      })
      .param('id', (req, res, next, id: string) => {
        if (!JOB_ID_PATTERN.test(id)) {
          res.status(400).json({ error: 'Invalid job ID' });
          return;
        }
        next();
      })
      .get(
        // '/jobs/:id/file',
        $.jobs.$id.file.pattern as ':id',
        agent,
        async (request, response, next) => {
          const printer = agentPrinter(request);
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
            createReadStream(filePath)
              .on('error', next)
              .pipe(response);
          } catch {
            response
              .status(404)
              .json({ error: 'Job file not found' });
          }
        },
      )

      .post(
        // '/jobs/:id/status',
        $.jobs.$id.status.pattern as ':id',
        agent,
        async (request, response) => {
          const printer = agentPrinter(request);
          const body: unknown = request.body;
          const status =
            typeof body === 'object' &&
            body !== null &&
            'status' in body
              ? body.status
              : undefined;
          if (status !== 'printed' && status !== 'failed') {
            response
              .status(400)
              .json({ error: 'Invalid status report' });
            return;
          }
          const errorText =
            status === 'failed' &&
            typeof body === 'object' &&
            body !== null &&
            'error' in body
              ? String(body.error).slice(0, MAX_ERROR_LENGTH)
              : undefined;
          const jobId = request.params.id;
          if (
            !JOB_ID_PATTERN.test(jobId) ||
            !reportJob(db, printer.id, jobId, status, errorText)
          ) {
            response
              .status(404)
              .json({ error: 'Job not found or already completed' });
            return;
          }
          // A failed job keeps its PDF so an admin can retry it until it expires.
          if (status === 'printed') {
            await rm(join(jobsDir, `${jobId}.pdf`), { force: true });
          }
          getHub().publishJob(printer.id, jobId, status);
          response.json({ accepted: true });
        },
      )
  );
};
