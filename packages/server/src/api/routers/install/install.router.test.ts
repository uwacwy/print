import {
  $,
  type EnrollResponse,
  type EnrollTokenResponse,
  installUrl,
} from '@uwacwy/print-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPrinter,
  testEntra,
  testUploadConfig,
} from '../../../realtime/test-support';
import { getPrinterBySlug } from '../../helpers/database/database';
import { signEnrollToken } from '../../helpers/enroll-token/enroll-token';
import { testPublicUrl, useApiServer } from '../../test-support';

const serverUrl = 'https://print.example.org';

describe('agent enrollment', () => {
  const { bearer, entra } = testEntra({
    adminRole: 'PrintAdmin',
  });
  const api = useApiServer({
    enrollment: { serverUrl, tokenTtlMinutes: 30 },
    entra,
  });
  const admin = async () => ({
    authorization: await bearer({
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
      sub: 'admin',
    }),
  });

  const mint = async () => {
    const response = await fetch(
      `${api.baseUrl}${$.api.printers.enrollToken()}`,
      {
        headers: await admin(),
        method: 'POST',
      },
    );
    expect(response.status).toBe(201);
    return (await response.json()) as EnrollTokenResponse;
  };

  const enroll = (token: string, body: unknown) =>
    fetch(`${api.baseUrl}${$.api.agent.enroll()}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

  const front = {
    name: 'Front Desk',
    queue: 'cups://Front_Desk',
    slug: 'front-desk',
  };

  beforeEach(() => api.start());

  it('lets only admins mint enrollment tokens', async () => {
    const anonymous = await fetch(
      `${api.baseUrl}${$.api.printers.enrollToken()}`,
      {
        method: 'POST',
      },
    );
    expect(anonymous.status).toBe(401);

    const { expiresAt, serverUrl: url, token } = await mint();
    expect(token).toMatch(/^[\w-]{44}$/);
    expect(url).toBe(serverUrl);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(
      29 * 60_000,
    );
  });

  it('answers 503 without a usable PUBLIC_URL', async () => {
    await api.start({ enrollment: undefined });
    const response = await fetch(
      `${api.baseUrl}${$.api.printers.enrollToken()}`,
      {
        headers: await admin(),
        method: 'POST',
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'public_url_required',
    });
    expect(
      await (
        await fetch(`${api.baseUrl}${$.api.clientConfig()}`)
      ).json(),
    ).toMatchObject({
      enrollment: false,
      publicUrl: testPublicUrl.href,
    });
  });

  it('enrolls a printer, rejects a taken slug, and lets the agent report its queue', async () => {
    const { token } = await mint();

    const created = await enroll(token, front);
    expect(created.status).toBe(201);
    const body = (await created.json()) as EnrollResponse;
    expect(body.printer).toEqual(front);
    expect(body.agentToken).toMatch(/^[\w-]{43}$/);

    // Multi-use within its lifetime.
    const again = await enroll(token, front);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      code: 'slug_taken',
    });

    const invalid = await enroll(token, {
      ...front,
      slug: 'Bad Slug',
    });
    expect(invalid.status).toBe(400);

    const patch = (authorization: string, queue: unknown) =>
      fetch(`${api.baseUrl}${$.api.agent.printer()}`, {
        body: JSON.stringify({ queue }),
        headers: {
          authorization,
          'content-type': 'application/json',
        },
        method: 'PATCH',
      });
    expect(
      (await patch(`Bearer ${token}`, 'cups://Other')).status,
    ).toBe(401);
    const updated = await patch(
      `Bearer ${body.agentToken}`,
      'ipp://printer.local:631/ipp/print',
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      ...front,
      queue: 'ipp://printer.local:631/ipp/print',
    });
    expect(getPrinterBySlug(api.db, 'front-desk')?.queue).toBe(
      'ipp://printer.local:631/ipp/print',
    );
    expect(
      (await patch(`Bearer ${body.agentToken}`, 'nope')).status,
    ).toBe(400);
  });

  it('rejects missing, invalid, and expired enrollment tokens', async () => {
    const missing = await fetch(
      `${api.baseUrl}${$.api.agent.enroll()}`,
      {
        method: 'POST',
      },
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({
      code: 'enroll_token_required',
    });

    // An agent token is not an enrollment token.
    const { token: agentToken } = addPrinter(api.db);
    expect(
      await (await enroll(agentToken, front)).json(),
    ).toMatchObject({ code: 'enroll_token_invalid' });

    const { token: expired } = signEnrollToken(
      testUploadConfig.access,
      1,
      new Date(Date.now() - 5 * 60_000),
    );
    expect(
      await (await enroll(expired, front)).json(),
    ).toMatchObject({
      code: 'enroll_token_expired',
    });
  });

  it('includes the server URL when an admin creates a printer', async () => {
    const response = await fetch(
      `${api.baseUrl}${$.api.printers()}`,
      {
        body: JSON.stringify(front),
        headers: {
          ...(await admin()),
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    expect(await response.json()).toMatchObject({ serverUrl });
  });

  describe('install scripts', () => {
    const shellscript = 'text/x-shellscript; charset=utf-8';

    it('serves the enrollment script for a valid token', async () => {
      const { token } = await mint();
      const response = await fetch(
        installUrl(api.baseUrl, token),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        shellscript,
      );
      expect(response.headers.get('cache-control')).toBe(
        'no-store',
      );
      const script = await response.text();
      expect(script).toContain(
        `PRINT_SERVER_URL='${serverUrl}'`,
      );
      expect(script).toContain(`PRINT_ENROLL_TOKEN='${token}'`);
      expect(script).toContain(
        'AGENT_VERSION="${AGENT_VERSION:-9.9.9}"',
      );
    });

    it('serves the generic script without a token', async () => {
      const script = await (
        await fetch(installUrl(api.baseUrl))
      ).text();
      expect(script).toContain("PRINT_ENROLL_TOKEN=''");
    });

    it('answers bad tokens with an explanatory script', async () => {
      const invalid = await fetch(
        installUrl(api.baseUrl, 'x'.repeat(44)),
      );
      expect(invalid.status).toBe(401);
      expect(invalid.headers.get('content-type')).toBe(
        shellscript,
      );
      expect(await invalid.text()).toMatch(
        /not valid[\s\S]*exit 1/,
      );

      const { token: expired } = signEnrollToken(
        testUploadConfig.access,
        1,
        new Date(Date.now() - 5 * 60_000),
      );
      const gone = await fetch(installUrl(api.baseUrl, expired));
      expect(gone.status).toBe(410);
      expect(await gone.text()).toContain('expired');
    });

    it('explains that PUBLIC_URL is required', async () => {
      await api.start({ enrollment: undefined });
      const response = await fetch(installUrl(api.baseUrl));
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('PUBLIC_URL');
    });
  });
});
