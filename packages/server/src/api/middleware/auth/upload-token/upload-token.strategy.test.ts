import { describe, expect, it } from 'vitest';

import { addPrinter } from '../../../../realtime/test-support';
import { setPrinterPin } from '../../../helpers/database/database';
import { uploadForm, useApiServer } from '../../../test-support';

describe('uploadToken strategy', () => {
  const api = useApiServer();

  it('requires a valid upload token before reading the upload', async () => {
    await api.start();
    addPrinter(api.db);
    addPrinter(api.db, 'back-office');

    const missing = await api.postUpload(
      await uploadForm(),
      undefined,
      null,
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({
      code: 'token_required',
    });

    const other = await api.postUpload(
      await uploadForm(),
      undefined,
      `Bearer ${await api.uploadToken('back-office')}`,
    );
    expect(await other.json()).toMatchObject({
      code: 'token_invalid',
    });

    const expired = await api.postUpload(
      await uploadForm(),
      undefined,
      `Bearer ${await api.uploadToken('front-office', { from: -3, to: -2 })}`,
    );
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({
      code: 'token_expired',
    });

    const early = await api.postUpload(
      await uploadForm(),
      undefined,
      `Bearer ${await api.uploadToken('front-office', { from: 2, to: 3 })}`,
    );
    expect(await early.json()).toMatchObject({
      code: 'token_not_yet_valid',
    });

    const job = await api.postUpload(await uploadForm());
    expect(job.status).toBe(201);
    const { jobId } = (await job.json()) as { jobId: string };
    const row = api.db
      .prepare('SELECT submitted_by FROM jobs WHERE id = ?')
      .get(jobId) as {
      submitted_by: string;
    };
    expect(row.submitted_by).toMatch(
      /^qr:\d{4}-[\d-]+T[\d:.]+Z\/\d{4}-[\d-]+T[\d:.]+Z$/,
    );
  });

  it('reports PIN and token status on the public printer endpoint', async () => {
    await api.start();
    const { id } = addPrinter(api.db);
    const url = `http://${api.host}/api/printers/front-office`;

    expect(await (await fetch(url)).json()).toMatchObject({
      access: { pinEnabled: false, token: null },
    });
    setPrinterPin(api.db, id, '123456789');
    const withToken = await fetch(url, {
      headers: {
        authorization: `Bearer ${await api.uploadToken()}`,
      },
    });
    expect(await withToken.json()).toMatchObject({
      access: {
        pinEnabled: true,
        token: 'valid',
        tokenExpiresAt: expect.any(String),
      },
    });
    const bad = await fetch(url, {
      headers: { authorization: 'Bearer nope' },
    });
    expect(await bad.json()).toMatchObject({
      access: { token: 'invalid', tokenExpiresAt: null },
    });
  });
});
