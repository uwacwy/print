import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  isAngularDevServer,
  loadLocalEnvFile,
  loadServerConfig,
} from './server-config';

const tenant = '11111111-1111-4111-8111-111111111111';
const client = '22222222-2222-4222-8222-222222222222';
const secret = {
  SITE_URL: 'http://print.example.org',
  UPLOAD_TOKEN_SECRET: 'x'.repeat(32),
};

describe('server config', () => {
  const dirs: string[] = [];
  afterEach(() =>
    dirs
      .splice(0)
      .forEach((dir) =>
        rmSync(dir, { force: true, recursive: true }),
      ),
  );

  it('parses TRUST_PROXY as a boolean or an address list', () => {
    const trust = (value?: string) =>
      loadServerConfig(
        value === undefined
          ? { ...secret }
          : { ...secret, TRUST_PROXY: value },
      ).trustProxy;
    expect(trust('true')).toBe(true);
    expect(trust('false')).toBe(false);
    expect(trust('10.0.0.1, loopback')).toEqual([
      '10.0.0.1',
      'loopback',
    ]);
    expect(trust()).toEqual([
      'loopback',
      'linklocal',
      'uniquelocal',
    ]);
  });

  it('loads Entra settings from the local env file without overriding the environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'print-env-'));
    dirs.push(dir);
    const file = join(dir, '.env');
    writeFileSync(
      file,
      `ENTRA_TENANT_ID=${tenant}\nENTRA_CLIENT_ID="${client}"\nSITE_TITLE=From file\n`,
    );
    const env: NodeJS.ProcessEnv = {
      ...secret,
      SITE_TITLE: 'From env',
    };

    loadLocalEnvFile(env, file);
    const config = loadServerConfig(env);

    expect(config.entra.tenantId).toBe(tenant);
    expect(config.entra.audience).toEqual([
      client,
      `api://${client}`,
    ]);
    expect(config.upload.siteTitle).toBe('From env');
  });

  it('ignores a missing env file', () => {
    const env: NodeJS.ProcessEnv = {};
    loadLocalEnvFile(env, join(tmpdir(), 'does-not-exist.env'));
    expect(env).toEqual({});
  });

  it('derives browser sign-in settings only when Entra is configured', () => {
    const site = {
      organizationName: 'Update env:SITE_ORG_NAME',
      showAttribution: true,
      title: 'Update env:SITE_TITLE',
      url: new URL(secret.SITE_URL).href,
    };
    expect(loadServerConfig(secret).client).toEqual({
      enrollment: false,
      site,
    });
    expect(
      loadServerConfig({
        ...secret,
        ENTRA_CLIENT_ID: client,
        ENTRA_TENANT_ID: tenant,
      }).client,
    ).toEqual({
      enrollment: false,
      msal: {
        apiScope: `api://${client}/Printers.Manage`,
        authority: `https://login.microsoftonline.com/${tenant}`,
        clientId: client,
        tenantId: tenant,
      },
      site,
    });
    expect(
      loadServerConfig({
        ...secret,
        ENTRA_ADMIN_SCOPE: 'Print.Admin',
        ENTRA_API_AUDIENCE: 'api://print.example.org',
        ENTRA_CLIENT_ID: client,
        ENTRA_TENANT_ID: tenant,
      }).client.msal?.apiScope,
    ).toBe('api://print.example.org/Print.Admin');
  });

  it('derives site settings from SITE_* variables', () => {
    const config = loadServerConfig({
      ...secret,
      SITE_FOOTER_LINKS:
        'label=Privacy&url=https://example.com/privacy',
      SITE_LOGO_ALT: 'Contoso logo',
      SITE_LOGO_URL: '/brand.svg',
      SITE_ORG_NAME: 'Contoso',
      SITE_SHOW_ATTRIBUTION: 'false',
      SITE_TITLE: 'Quick Print',
      SITE_URL: 'https://print.contoso.com',
    });
    expect(config.client.site).toEqual({
      links: [
        { label: 'Privacy', url: 'https://example.com/privacy' },
      ],
      logo: { alt: 'Contoso logo', url: '/brand.svg' },
      organizationName: 'Contoso',
      showAttribution: false,
      title: 'Quick Print',
      url: 'https://print.contoso.com/',
    });
    expect(config.logoAlt).toBe('Contoso logo');
    expect(config.siteUrl.href).toBe(
      'https://print.contoso.com/',
    );
    expect(config.upload.siteTitle).toBe('Quick Print');
  });

  it('describes a logo with SITE_ORG_NAME, and only when there is one', () => {
    const site = (env: NodeJS.ProcessEnv) =>
      loadServerConfig({ ...secret, ...env });
    expect(
      site({
        SITE_LOGO_URL: '/brand.svg',
        SITE_ORG_NAME: 'Contoso',
      }).client.site.logo,
    ).toEqual({ alt: 'Contoso', url: '/brand.svg' });
    expect(site({ SITE_ORG_NAME: 'Contoso' }).logoAlt).toBe(
      'Contoso',
    );
    expect(
      site({ SITE_LOGO_ALT: 'Logo', SITE_ORG_NAME: 'Contoso' })
        .client.site.logo,
    ).toBeUndefined();
    expect(site({}).logoAlt).toBe('Update env:SITE_ORG_NAME');
  });

  it('ignores the pre-1.0 names', () => {
    const { client, siteUrl } = loadServerConfig({
      ...secret,
      CLIENT_BRAND_LOGO: '/brand.svg',
      CLIENT_LEGAL_ORG_NAME: 'Legacy',
      PUBLIC_URL: 'https://legacy.example.org',
    });
    expect(client.site.logo).toBeUndefined();
    expect(client.site.organizationName).toBe(
      'Update env:SITE_ORG_NAME',
    );
    expect(siteUrl.href).toBe(new URL(secret.SITE_URL).href);
  });

  it('rejects unsafe SITE_FOOTER_LINKS', () => {
    expect(() =>
      loadServerConfig({
        ...secret,
        SITE_FOOTER_LINKS: 'label=x&url=javascript:alert(1)',
      }),
    ).toThrow('SITE_FOOTER_LINKS');
  });

  it('enables enrollment only for an https (or loopback http) SITE_URL', () => {
    const enrollment = (SITE_URL: string) =>
      loadServerConfig({ ...secret, SITE_URL });
    expect(
      enrollment('http://print.example.org').enrollment,
    ).toEqual({
      serverUrl: undefined,
      tokenTtlMinutes: 30,
    });
    expect(
      enrollment('https://print.example.org/x').enrollment
        .serverUrl,
    ).toBe('https://print.example.org');
    expect(
      enrollment('https://print.example.org').client.enrollment,
    ).toBe(true);
    expect(
      enrollment('http://localhost:4200').client.enrollment,
    ).toBe(true);
    expect(
      enrollment('http://print.example.org').client.enrollment,
    ).toBe(false);
    expect(
      loadServerConfig({
        ...secret,
        ENROLL_TOKEN_TTL_MINUTES: '5',
      }).enrollment.tokenTtlMinutes,
    ).toBe(5);
  });

  it('defaults SITE_URL to https://localhost:4200 and rejects invalid ones', () => {
    const { UPLOAD_TOKEN_SECRET } = secret;
    expect(
      loadServerConfig({ UPLOAD_TOKEN_SECRET }).siteUrl.href,
    ).toBe('https://localhost:4200/');
    expect(() =>
      loadServerConfig({
        SITE_URL: 'not a url',
        UPLOAD_TOKEN_SECRET,
      }),
    ).toThrow('SITE_URL');
    expect(loadServerConfig(secret).siteUrl.href).toBe(
      'http://print.example.org/',
    );
  });

  it('resolves DATA_DIR from the working directory', () => {
    expect(loadServerConfig(secret).dataDir).toBe(
      join(process.cwd(), 'data'),
    );
    expect(
      loadServerConfig({ ...secret, DATA_DIR: '/srv/print' })
        .dataDir,
    ).toBe('/srv/print');
  });

  it('keeps 14 days of access logs in DATA_DIR/logs unless ACCESS_LOG_DAYS is 0', () => {
    expect(
      loadServerConfig({ ...secret, DATA_DIR: '/srv/print' })
        .accessLog,
    ).toEqual({ dir: '/srv/print/logs', maxDays: 14 });
    expect(
      loadServerConfig({ ...secret, ACCESS_LOG_DAYS: '30' })
        .accessLog?.maxDays,
    ).toBe(30);
    expect(
      loadServerConfig({ ...secret, ACCESS_LOG_DAYS: '0' })
        .accessLog,
    ).toBeUndefined();
    expect(() =>
      loadServerConfig({ ...secret, ACCESS_LOG_DAYS: '-1' }),
    ).toThrow();
  });

  it('requires a long upload token secret and derives access limits', () => {
    expect(() => loadServerConfig({})).toThrow(
      'UPLOAD_TOKEN_SECRET is required',
    );
    expect(() =>
      loadServerConfig({
        ...secret,
        UPLOAD_TOKEN_SECRET: 'short',
      }),
    ).toThrow('at least 32');
    expect(
      loadServerConfig({
        ...secret,
        PIN_MAX_FAILURES: '4',
        PIN_TOKEN_INTERVAL_MINUTES: '5',
      }).upload.access,
    ).toEqual({
      ipv6Subnet: 56,
      pinMaxFailures: 4,
      pinTokenIntervalMs: 5 * 60_000,
      pinTokenTtlMs: 10 * 60_000,
      tokenIssuer: 'uwacwy-print',
      tokenMaxLifetimeMs: 365 * 86_400_000,
      tokenSecret: secret.UPLOAD_TOKEN_SECRET,
    });
  });

  it('detects the Angular CLI dev server from argv', () => {
    expect(
      isAngularDevServer([
        'node',
        '/app/node_modules/.bin/ng',
        'serve',
        'print-server',
      ]),
    ).toBe(true);
    expect(
      isAngularDevServer([
        'node',
        '/app/node_modules/@angular/cli/bin/ng.js',
        's',
      ]),
    ).toBe(true);
    expect(
      isAngularDevServer([
        'node',
        '/app/node_modules/.bin/ng',
        'build',
      ]),
    ).toBe(false);
    expect(
      isAngularDevServer([
        'node',
        '/app/dist/print-server/server/server.mjs',
      ]),
    ).toBe(false);
  });
});
