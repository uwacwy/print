import { $ } from '@uwacwy/print-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPrinter,
  testEntra,
} from '../../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../../test-support';
import { ENTRA_APP_ROLES } from './entra-app';

describe('entraApp strategy', () => {
  const { bearer, entra } = testEntra({
    adminRole: 'PrintAdmin',
  });
  const api = useApiServer({ entra });
  const appBearer = (
    roles: readonly string[] = ENTRA_APP_ROLES,
  ) =>
    bearer({
      azp: 'windmill-client',
      idtyp: 'app',
      oid: 'windmill-sp',
      roles: [...roles],
      sub: 'windmill-sp',
    });
  const call = (
    authorization: string,
    method: string,
    path: string,
    body?: FormData,
  ) =>
    fetch(`${api.baseUrl}${path}`, {
      body,
      headers: { authorization },
      method,
    });
  const slug = { slug: 'front-office' };

  let printerId: number;
  let agentToken: string;

  beforeEach(async () => {
    await api.start();
    ({ id: printerId, token: agentToken } = addPrinter(api.db));
  });

  const storedPin = () =>
    (
      api.db
        .prepare('SELECT pin FROM printers WHERE id = ?')
        .get(printerId) as { pin: null | string }
    ).pin;

  it('runs the event-prep flow without ever revealing the PIN', async () => {
    const authorization = await appBearer();

    const rotated = await call(
      authorization,
      'POST',
      $.api.printers.$slug.pin(slug),
    );
    expect(rotated.status).toBe(200);
    const rotatedBody = (await rotated.json()) as Record<
      string,
      unknown
    >;
    const pin = storedPin();
    expect(pin).toMatch(/^\d{9}$/);
    expect(rotatedBody).not.toHaveProperty('pin');
    expect(rotatedBody).toMatchObject({ pinEnabled: true });
    expect(JSON.stringify(rotatedBody)).not.toMatch(
      /\d{3}-\d{3}-\d{3}/,
    );

    const flyer = await call(
      authorization,
      'POST',
      $.api.printers.$slug.qrPrint(slug),
    );
    expect(flyer.status).toBe(202);
    const { jobId: flyerJob } = (await flyer.json()) as {
      jobId: string;
    };

    const sheet = await call(
      authorization,
      'POST',
      $.api.printers.$slug.jobs(slug),
      await uploadForm({ document__copies_0: '3' }),
    );
    expect(sheet.status).toBe(201);
    const { jobId: sheetJob } = (await sheet.json()) as {
      jobId: string;
    };
    expect(
      api.db
        .prepare(
          'SELECT submitted_by FROM jobs WHERE id IN (?, ?)',
        )
        .all(flyerJob, sheetJob),
    ).toEqual([
      { submitted_by: 'app:windmill-client' },
      { submitted_by: 'app:windmill-client' },
    ]);

    const agent = await api.connectAgent(agentToken);
    await expect(agent.next()).resolves.toMatchObject({
      jobs: [{ id: flyerJob }, { id: sheetJob }],
      type: 'jobs',
    });

    const status = await call(
      authorization,
      'GET',
      $.api.printers.$slug(slug),
    );
    expect(status.status).toBe(200);
    const statusBody = (await status.json()) as Record<
      string,
      unknown
    >;
    expect(statusBody).toMatchObject({
      access: { pinEnabled: true, signedIn: false },
      activeJobs: 2,
      online: true,
      slug: 'front-office',
    });
    expect(statusBody).not.toHaveProperty('pin');

    const disabled = await call(
      authorization,
      'DELETE',
      $.api.printers.$slug.pin(slug),
    );
    expect(disabled.status).toBe(200);
    const disabledBody = (await disabled.json()) as Record<
      string,
      unknown
    >;
    expect(disabledBody).not.toHaveProperty('pin');
    expect(disabledBody).toMatchObject({ pinEnabled: false });
    expect(storedPin()).toBeNull();
  });

  it('requires the matching app role for each endpoint', async () => {
    const authorization = await appBearer([]);
    const cases: [string, string][] = [
      ['POST', $.api.printers.$slug.pin(slug)],
      ['DELETE', $.api.printers.$slug.pin(slug)],
      ['POST', $.api.printers.$slug.qrPrint(slug)],
    ];
    for (const [method, path] of cases) {
      const response = await call(authorization, method, path);
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'app_role_required',
      });
    }
    const upload = await call(
      authorization,
      'POST',
      $.api.printers.$slug.jobs(slug),
      await uploadForm(),
    );
    expect(upload.status).toBe(403);
    expect(await upload.json()).toMatchObject({
      code: 'app_role_required',
      role: 'Printer.PrintJob',
    });

    // Without Printer.Read the printer page is public-only.
    const view = (await (
      await call(
        authorization,
        'GET',
        $.api.printers.$slug(slug),
      )
    ).json()) as Record<string, unknown>;
    expect(view).not.toHaveProperty('online');
    expect(view).not.toHaveProperty('pin');
  });

  it('keeps applications out of administrator-only endpoints', async () => {
    const authorization = await appBearer();
    const cases: [string, string][] = [
      ['GET', $.api.printers()],
      ['GET', $.api.session()],
      ['GET', $.api.printers.$slug.qrPdf(slug)],
      ['POST', $.api.printers.$slug.qrToken(slug)],
      ['POST', $.api.printers.$slug.qrEpoch(slug)],
      ['POST', $.api.printers.$slug.agentToken(slug)],
      ['PATCH', $.api.printers.$slug(slug)],
      ['DELETE', $.api.printers.$slug.jobs(slug)],
    ];
    for (const [method, path] of cases) {
      const response = await call(authorization, method, path);
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'app_token_not_allowed',
      });
    }
  });

  it('leaves delegated tokens to entraUser', async () => {
    const response = await call(
      await bearer({ scp: 'User.Read', sub: 'someone' }),
      'POST',
      $.api.printers.$slug.pin(slug),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'admin_scope_required',
    });
  });
});
