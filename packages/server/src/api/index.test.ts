import { beforeEach, describe, expect, it } from 'vitest';

import { addPrinter } from '../realtime/test-support';
import { testPublicUrl, useApiServer } from './test-support';

describe('API root', () => {
  const api = useApiServer();
  beforeEach(() => api.start());

  it('keeps health public, protects management routes, and has no /admin prefix', async () => {
    expect(
      (await fetch(`${api.baseUrl}/api/healthz`)).status,
    ).toBe(200);
    expect(
      (await fetch(`${api.baseUrl}/api/printers`)).status,
    ).toBe(401);
    expect(
      (await fetch(`${api.baseUrl}/api/admin/session`)).status,
    ).toBe(404);
  });

  it('publicly reports only how many printers have a connected agent', async () => {
    const status = () =>
      fetch(`${api.baseUrl}/api/status`).then(
        async (response) => ({
          body: await response.json(),
          cache: response.headers.get('cache-control'),
          status: response.status,
        }),
      );
    expect(await status()).toEqual({
      body: { printersOnline: 0 },
      cache: 'no-store',
      status: 200,
    });

    addPrinter(api.db, 'offline-printer');
    const { token } = addPrinter(api.db, 'online-printer');
    await api.connectAgent(token);
    expect((await status()).body).toEqual({ printersOnline: 1 });
  });

  it('publicly serves the runtime sign-in settings for the browser', async () => {
    const clientConfig = () =>
      fetch(`${api.baseUrl}/api/client-config`).then(
        async (response) => ({
          body: await response.json(),
          cache: response.headers.get('cache-control'),
          status: response.status,
        }),
      );
    expect(await clientConfig()).toEqual({
      body: { enrollment: false, publicUrl: testPublicUrl.href },
      cache: 'no-cache',
      status: 200,
    });

    const msal = {
      apiScope: 'api://client/Printers.Manage',
      authority: 'https://login.microsoftonline.com/tenant',
      clientId: 'client',
      tenantId: 'tenant',
    };
    await api.start({
      client: {
        enrollment: true,
        msal,
        publicUrl: testPublicUrl,
      },
    });
    expect((await clientConfig()).body).toEqual({
      enrollment: true,
      msal,
      publicUrl: testPublicUrl.href,
    });
  });
});
