import { beforeEach, describe, expect, it } from 'vitest';
import { testPublicUrl, useApiServer } from './test-support';
import { addPrinter } from '../realtime/test-support';

describe('API root', () => {
  const api = useApiServer();
  beforeEach(() => api.start());

  it('keeps health public, protects management routes, and has no /admin prefix', async () => {
    expect((await fetch(`${api.baseUrl}/api/healthz`)).status).toBe(
      200,
    );
    expect((await fetch(`${api.baseUrl}/api/printers`)).status).toBe(
      401,
    );
    expect(
      (await fetch(`${api.baseUrl}/api/admin/session`)).status,
    ).toBe(404);
  });

  it('publicly reports only how many printers have a connected agent', async () => {
    const status = () =>
      fetch(`${api.baseUrl}/api/status`).then(async (response) => ({
        status: response.status,
        cache: response.headers.get('cache-control'),
        body: await response.json(),
      }));
    expect(await status()).toEqual({
      status: 200,
      cache: 'no-store',
      body: { printersOnline: 0 },
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
          status: response.status,
          cache: response.headers.get('cache-control'),
          body: await response.json(),
        }),
      );
    expect(await clientConfig()).toEqual({
      status: 200,
      cache: 'no-cache',
      body: { enrollment: false, publicUrl: testPublicUrl.href },
    });

    const msal = {
      tenantId: 'tenant',
      clientId: 'client',
      authority: 'https://login.microsoftonline.com/tenant',
      apiScope: 'api://client/Printers.Manage',
    };
    await api.start({
      client: { msal, enrollment: true, publicUrl: testPublicUrl },
    });
    expect((await clientConfig()).body).toEqual({
      msal,
      enrollment: true,
      publicUrl: testPublicUrl.href,
    });
  });
});
