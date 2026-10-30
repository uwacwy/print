import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  agentJobFilePath,
  agentJobStatusPath,
} from '@uwacwy/print-shared';
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
      jobId: string;
      agentOnline: boolean;
    };
    expect(body.agentOnline).toBe(true);

    await expect(agent.next()).resolves.toEqual({
      type: 'jobs',
      jobs: [{ id: body.jobId, title: 'Intake packet' }],
    });

    const unauthorized = await fetch(
      `http://${api.host}${agentJobFilePath(body.jobId)}`,
    );
    expect(unauthorized.status).toBe(401);

    const file = await fetch(
      `http://${api.host}${agentJobFilePath(body.jobId)}`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');

    const report = await fetch(
      `http://${api.host}${agentJobStatusPath(body.jobId)}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'printed' }),
      },
    );
    expect(report.status).toBe(200);
    expect(existsSync(join(api.jobsDir, `${body.jobId}.pdf`))).toBe(
      false,
    );

    const again = await fetch(
      `http://${api.host}${agentJobStatusPath(body.jobId)}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'printed' }),
      },
    );
    expect(again.status).toBe(404);
    expect(api.hub.isOnline(id)).toBe(true);
  });
});
