import type { ClientConfig } from '@uwacwy/print-shared';

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { addPrinter } from '../realtime/test-support';
import { testSiteUrl, useApiServer } from './test-support';

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
      body: {
        enrollment: false,
        site: {
          organizationName: 'Update env:SITE_ORG_NAME',
          showAttribution: true,
          title: expect.any(String),
          url: testSiteUrl.href,
        },
      },
      cache: 'no-cache',
      status: 200,
    });

    const client = {
      enrollment: true,
      msal: {
        apiScope: 'api://client/Printers.Manage',
        authority: 'https://login.microsoftonline.com/tenant',
        clientId: 'client',
        tenantId: 'tenant',
      },
      site: {
        organizationName: 'Test Org',
        showAttribution: false,
        title: 'Test',
        url: testSiteUrl.href,
      },
    } satisfies ClientConfig;
    await api.start({ client });
    expect((await clientConfig()).body).toEqual(client);
  });

  describe('site logo', () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const dir of dirs.splice(0)) {
        rmSync(dir, { force: true, recursive: true });
      }
    });
    const site = () =>
      fetch(`${api.baseUrl}/api/client-config`)
        .then((response) => response.json())
        .then((body: ClientConfig) => body.site);

    it('resolves the logo on every request, with no restart', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'api-logo-'));
      dirs.push(dir);
      await api.start({ logo: { alt: 'Contoso', dirs: [dir] } });
      expect((await site()).logo).toBeUndefined();

      writeFileSync(join(dir, 'logo.svg'), '<svg/>');
      expect((await site()).logo).toEqual({
        alt: 'Contoso',
        url: expect.stringMatching(/^\/logo\.svg\?v=/),
      });
    });

    it('lets SITE_LOGO_URL override the files', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'api-logo-'));
      dirs.push(dir);
      writeFileSync(join(dir, 'logo.svg'), '<svg/>');
      const logo = { alt: 'Org', url: 'https://cdn.test/l.png' };
      await api.start({
        client: {
          enrollment: false,
          site: {
            logo,
            organizationName: 'Org',
            showAttribution: true,
            title: 'T',
            url: testSiteUrl.href,
          },
        },
        logo: { alt: 'Org', dirs: [dir] },
      });
      expect((await site()).logo).toEqual(logo);
    });
  });
});
