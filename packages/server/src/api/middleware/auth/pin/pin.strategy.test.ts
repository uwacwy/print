import { describe, expect, it } from 'vitest';
import { addPrinter } from '../../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../../test-support';
import { setPrinterPin } from '../../../helpers/database/database';

describe('pin strategy', () => {
  const api = useApiServer();

  it('exchanges the printer PIN for a short-lived token, once per interval', async () => {
    await api.start();
    const { id } = addPrinter(api.db);

    const disabled = await api.exchangePin('123-456-789');
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({
      code: 'pin_disabled',
    });

    setPrinterPin(api.db, id, '123456789');
    expect(
      (
        await api.exchangePin('123-456-789', {
          'sec-fetch-site': 'cross-site',
        })
      ).status,
    ).toBe(403);
    const wrong = await api.exchangePin('999-999-999');
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({
      code: 'pin_incorrect',
    });

    const issued = await api.exchangePin('123 456 789');
    expect(issued.status).toBe(201);
    const { token, expiresAt } = (await issued.json()) as {
      token: string;
      expiresAt: string;
    };
    expect(
      new Date(expiresAt).getTime() - Date.now(),
    ).toBeLessThanOrEqual(api.upload.access.pinTokenTtlMs + 60_000);

    const job = await api.postUpload(
      await uploadForm(),
      undefined,
      `Bearer ${token}`,
    );
    expect(job.status).toBe(201);

    const again = await api.exchangePin('123-456-789');
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({
      code: 'pin_rate_limited',
    });
  });

  it('accepts a PIN directly on the upload and shares the wrong-PIN lockout', async () => {
    await api.start();
    const { id } = addPrinter(api.db);
    setPrinterPin(api.db, id, '123456789');

    const direct = await api.postUpload(
      await uploadForm(),
      undefined,
      'Pin 123-456-789',
    );
    expect(direct.status).toBe(201);
    const { jobId } = (await direct.json()) as { jobId: string };
    expect(
      api.db
        .prepare('SELECT submitted_by FROM jobs WHERE id = ?')
        .get(jobId),
    ).toEqual({
      submitted_by: 'pin',
    });

    for (
      let attempt = 0;
      attempt < api.upload.access.pinMaxFailures;
      attempt++
    ) {
      const wrong = await api.postUpload(
        await uploadForm(),
        undefined,
        'Pin 000-000-000',
      );
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({
        code: 'pin_incorrect',
      });
    }
    expect(
      (
        await api.postUpload(
          await uploadForm(),
          undefined,
          'Pin 123-456-789',
        )
      ).status,
    ).toBe(429);
    expect((await api.exchangePin('123-456-789')).status).toBe(429);
  });
});
