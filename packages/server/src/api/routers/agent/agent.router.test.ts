import { $ } from '@uwacwy/print-shared';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { addPrinter } from '../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../test-support';

describe('agent router', () => {
  const api = useApiServer();

  it('pushes an uploaded job to the connected agent immediately and accepts its report', async () => {
    await api.start();
    const { id, token } = addPrinter(api.db);
    const agent = await api.connectAgent(token);

    const response = await api.postUpload(
      await uploadForm({ job__title: 'Intake packet' }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      agentOnline: boolean;
      jobId: string;
    };
    expect(body.agentOnline).toBe(true);

    await expect(agent.next()).resolves.toEqual({
      jobs: [{ id: body.jobId, title: 'Intake packet' }],
      type: 'jobs',
    });

    const unauthorized = await fetch(
      new URL(
        $.api.agent.jobs.$id.file({ id: body.jobId }),
        `http://${api.host}`,
      ),
    );
    expect(unauthorized.status).toBe(401);

    const file = await fetch(
      new URL(
        $.api.agent.jobs.$id.file({ id: body.jobId }),
        `http://${api.host}`,
      ),
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe(
      'application/pdf',
    );
    expect(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');

    const report = await fetch(
      new URL(
        $.api.agent.jobs.$id.status({ id: body.jobId }),
        `http://${api.host}`,
      ),
      {
        body: JSON.stringify({ status: 'printed' }),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    expect(report.status).toBe(200);
    expect(
      existsSync(join(api.jobsDir, `${body.jobId}.pdf`)),
    ).toBe(false);

    const again = await fetch(
      new URL(
        $.api.agent.jobs.$id.status({ id: body.jobId }),
        `http://${api.host}`,
      ),
      {
        body: JSON.stringify({ status: 'printed' }),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    expect(again.status).toBe(404);
    expect(api.hub.isOnline(id)).toBe(true);
  });

  it("keeps a failed job's document so it can be retried", async () => {
    await api.start();
    const { token } = addPrinter(api.db);
    const agent = await api.connectAgent(token);
    const response = await api.postUpload(
      await uploadForm({ job__title: 'Intake packet' }),
    );
    const { jobId } = (await response.json()) as {
      jobId: string;
    };
    await agent.next();

    const report = await fetch(
      new URL(
        $.api.agent.jobs.$id.status({ id: jobId }),
        `http://${api.host}`,
      ),
      {
        body: JSON.stringify({
          error: 'jammed',
          status: 'failed',
        }),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    expect(report.status).toBe(200);
    expect(existsSync(join(api.jobsDir, `${jobId}.pdf`))).toBe(
      true,
    );
    expect(
      api.db
        .prepare('SELECT status, error FROM jobs WHERE id = ?')
        .get(jobId),
    ).toEqual({ error: 'jammed', status: 'failed' });
  });
});
