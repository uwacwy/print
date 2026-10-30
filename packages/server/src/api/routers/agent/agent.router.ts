import express from 'express';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_ERROR_LENGTH } from '@uwacwy/print-shared';
import {
  getJobForPrinter,
  reportJob,
  type PrintDatabase,
} from '../../helpers/database/database';
import type { AgentHub } from '../../../realtime/agent-hub';
import { createAuthenticate } from '../../middleware/auth/passport/passport';
import { principal } from '../../middleware/auth/principal';

export interface AgentApiOptions {
  db: PrintDatabase;
  jobsDir: string;
  getHub: () => AgentHub;
}

const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const agentPrinter = (request: express.Request) => {
  const who = principal(request);
  if (who.kind !== 'agent') {
    throw new Error('Expected an agent principal.');
  }
  return who.printer;
};

/** HTTP side of the agent protocol; mounted at `/agent` to match the shared path helpers. */
export default ({ db, jobsDir, getHub }: AgentApiOptions) => {
  const agent = createAuthenticate({ db })('agentToken');
  return express
    .Router()

    .get(
      '/jobs/:id/file',
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
          response.status(404).json({ error: 'Job file not found' });
        }
      },
    )

    .post('/jobs/:id/status', agent, async (request, response) => {
      const printer = agentPrinter(request);
      const body: unknown = request.body;
      const status =
        typeof body === 'object' && body !== null && 'status' in body
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
      await rm(join(jobsDir, `${jobId}.pdf`), { force: true });
      getHub().publishJob(printer.id, jobId, status);
      response.json({ accepted: true });
    });
};
