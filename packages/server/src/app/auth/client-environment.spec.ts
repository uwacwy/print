import { describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import {
  loadClientEnvironment,
  toClientEnvironment,
} from './client-environment';

const msal = {
  apiScope: 'api://client/Printers.Manage',
  authority: 'https://login.microsoftonline.com/tenant',
  clientId: 'client',
  tenantId: 'tenant',
};

const respond = (response: Response) =>
  vi.fn<typeof fetch>().mockResolvedValue(response);

describe('client environment', () => {
  const publicUrl = new URL('https://print.example.org');
  it('uses the server settings with a callback on the current origin', () => {
    expect(
      toClientEnvironment(
        {
          enrollment: true,
          msal,
          publicUrl,
        },
        'https://print.example.org',
      ),
    ).toEqual({
      enrollment: true,
      msal: {
        ...msal,
        redirectUri: 'https://print.example.org/auth/callback',
      },
    });
  });

  it('falls back to the build-time sign-in when the server has none', () => {
    expect(
      toClientEnvironment(
        {
          enrollment: false,
          publicUrl,
        },
        'https://print.example.org',
      ),
    ).toEqual({ ...environment, enrollment: false });
  });

  it('passes the server logo through', () => {
    const logo = { alt: 'United Way', src: '/logo.svg?v=1' };
    expect(
      toClientEnvironment(
        { enrollment: false, logo, publicUrl },
        'https://print.example.org',
      ).logo,
    ).toEqual(logo);
    expect(
      toClientEnvironment(
        { enrollment: false, logo, msal, publicUrl },
        'https://print.example.org',
      ).logo,
    ).toEqual(logo);
  });

  it('loads /api/client-config and falls back when it fails', async () => {
    const ok = respond(
      Response.json({ enrollment: false, msal, publicUrl }),
    );
    await expect(
      loadClientEnvironment(ok, 'http://localhost:4200'),
    ).resolves.toEqual({
      enrollment: false,
      msal: {
        ...msal,
        redirectUri: 'http://localhost:4200/auth/callback',
      },
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
