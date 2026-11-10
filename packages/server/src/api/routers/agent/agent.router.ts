import {
  AgentPrinterUpdate,
  agents,
  type EnrollResponse,
  JobId,
  JobReport,
  MAX_ERROR_LENGTH,
  PrinterInput,
} from '@uwacwy/print-shared';
import express from 'express';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createRouting } from 'ts-routes';
import { z } from 'zod';

import type { UploadConfig } from '../../helpers/server-config/server-config';
import type { AgentHub } from '../../sockets/agent-hub/agent-hub';

import {
  createPrinter,
  getJobForPrinter,
  getPrinterById,
  type PrintDatabase,
  printerFields,
  type PrinterRow,
  reportJob,
  updatePrinter,
} from '../../helpers/database/database';
import { toPrinterFields } from '../../helpers/printers';
import { createAuthenticate } from '../../middleware/auth/passport/passport';
import { principal } from '../../middleware/auth/principal';
import { enrollRateLimit } from '../../middleware/rate-limits/rate-limits';
import { validate } from '../../middleware/validate/validate';

export interface AgentApiOptions {
  db: PrintDatabase;
  getHub: () => AgentHub;
  jobsDir: string;
  /** Its token key also signs enrollment tokens. */
  upload: UploadConfig;
}

const agentView = ({ name, queue, slug }: PrinterRow) => ({
  name,
  queue,
  slug,
});

const jobParams = z.object({ id: JobId });

const agentPrinter = (request: express.Request) => {
  const who = principal(request);
  if (who.kind !== 'agent') {
    throw new Error('Expected an agent principal.');
  }
  return who.printer;
};

const $ = createRouting(agents);

/** HTTP side of the agent protocol; mounted at the shared `api.agent` route. */
export default ({
  db,
  getHub,
  jobsDir,
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
        validate({ body: PrinterInput }),
        (request, response) => {
          const created = createPrinter(
            db,
            toPrinterFields(request.body),
          );
          if (typeof created === 'string') {
            response
              .status(409)
              .json({ code: 'slug_taken', error: created });
            return;
          }
          response.status(201).json({
            agentToken: created.token,
            printer: agentView(getPrinterById(db, created.id)!),
          } satisfies EnrollResponse);
        },
      )

      // Agents report the queue they actually print to, so the admin list reflects the host.
      .patch(
        $.printer.pattern,
        agent,
        validate({ body: AgentPrinterUpdate }),
        (request, response) => {
          const printer = agentPrinter(request);
          updatePrinter(db, printer.id, {
            ...printerFields(printer),
            queue: request.body.queue,
          });
          response.json(
            agentView(getPrinterById(db, printer.id)!),
          );
        },
      )
      .get(
        // '/jobs/:id/file',
        $.jobs.$id.file.pattern as ':id',
        agent,
        validate({ params: jobParams }),
        async (request, response, next) => {
          const printer = agentPrinter(request);
          const job = getJobForPrinter(
            db,
            printer.id,
            request.params.id,
          );
          if (!job || job.status !== 'printing') {
            response
              .status(404)
              .json({ error: 'Job not found' });
            return;
          }
          const filePath = join(jobsDir, `${job.id}.pdf`);
          try {
            const { size } = await stat(filePath);
            response.writeHead(200, {
              'cache-control': 'no-store',
              'content-disposition': `attachment; filename="${job.id}.pdf"`,
              'content-length': size,
              'content-type': 'application/pdf',
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
        validate({ body: JobReport, params: jobParams }),
        async (request, response) => {
          const { body, params } = request;
          const printer = agentPrinter(request);
          const jobId = params.id;
          const errorText =
            body.status === 'failed'
              ? body.error.slice(0, MAX_ERROR_LENGTH)
              : undefined;
          if (
            !reportJob(
              db,
              printer.id,
              jobId,
              body.status,
              errorText,
            )
          ) {
            response.status(404).json({
              error: 'Job not found or already completed',
            });
            return;
          }
          // A failed job keeps its PDF so an admin can retry it until it expires.
          if (body.status === 'printed') {
            await rm(join(jobsDir, `${jobId}.pdf`), {
              force: true,
            });
          }
          getHub().publishJob(printer.id, jobId, body.status);
          response.json({ accepted: true });
        },
      )
  );
};
