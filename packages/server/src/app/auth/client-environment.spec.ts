import type { ClientConfig } from '@uwacwy/print-shared';

import { describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import {
  loadClientEnvironment,
  resolveClientConfig,
} from './client-environment';

const msal = {
  apiScope: 'api://client/Printers.Manage',
  authority: 'https://login.microsoftonline.com/tenant',
  clientId: 'client',
  tenantId: 'tenant',
};

const site = {
  organizationName: 'Contoso',
  showAttribution: true,
  title: 'Quick Print',
  url: new URL('https://print.contoso.com').href,
} satisfies ClientConfig['site'];

const respond = (response: Response) =>
  vi.fn<typeof fetch>().mockResolvedValue(response);

describe('client environment', () => {
  it('uses the server settings with a callback on the current origin', () => {
    expect(
      resolveClientConfig(
        {
          enrollment: true,
          msal,
          site,
        },
        'https://print.contoso.com',
      ),
    ).toEqual({
      enrollment: true,
      msal: {
        ...msal,
        redirectUri: 'https://print.contoso.com/auth/callback',
      },
      site,
    });
  });

  it('falls back to the build-time sign-in when the server has none', () => {
    expect(
      resolveClientConfig(
        {
          enrollment: false,
          site,
        },
        'https://print.contoso.com',
      ),
    ).toEqual({
      enrollment: false,
      msal: {
        ...environment.msal,
        redirectUri: 'https://print.contoso.com/auth/callback',
      },
      site,
    });
  });

  it('passes the server logo through', () => {
    const logo = { alt: 'Contoso', url: '/logo.svg?v=1' };
    const withLogo = { ...site, logo };
    expect(
      resolveClientConfig(
        { enrollment: false, site: withLogo },
        'https://print.contoso.com',
      ).site.logo,
    ).toEqual(logo);
    expect(
      resolveClientConfig(
        { enrollment: false, msal, site: withLogo },
        'https://print.contoso.com',
      ).site.logo,
    ).toEqual(logo);
  });

  it('loads /api/client-config and falls back when it fails', async () => {
    const ok = respond(
      Response.json({
        enrollment: false,
        msal,
        site,
      }),
    );
    await expect(
      loadClientEnvironment(ok, 'http://localhost:4200'),
    ).resolves.toEqual({
      enrollment: false,
      msal: {
        ...msal,
        redirectUri: 'http://localhost:4200/auth/callback',
      },
      site,
    });
    expect(ok).toHaveBeenCalledWith('/api/client-config', {
      cache: 'no-cache',
    });

    vi.spyOn(console, 'warn').mockImplementation(
      () => undefined,
    );
    await expect(
      loadClientEnvironment(
        respond(new Response('', { status: 500 })),
        'http://localhost:4200',
      ),
    ).resolves.toBe(environment);
  });
});
