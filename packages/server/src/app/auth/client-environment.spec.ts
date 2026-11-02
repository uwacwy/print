import { describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import {
  loadClientEnvironment,
  toClientEnvironment,
} from './client-environment';

const msal = {
  tenantId: 'tenant',
  clientId: 'client',
  authority: 'https://login.microsoftonline.com/tenant',
  apiScope: 'api://client/Printers.Manage',
};

const respond = (response: Response) =>
  vi.fn<typeof fetch>().mockResolvedValue(response);

describe('client environment', () => {
  it('uses the server settings with a callback on the current origin', () => {
    expect(
      toClientEnvironment({ msal }, 'https://print.example.org'),
    ).toEqual({
      msal: {
        ...msal,
        redirectUri: 'https://print.example.org/auth/callback',
      },
    });
  });

  it('falls back to the build-time environment when the server has no sign-in', () => {
    expect(
      toClientEnvironment({}, 'https://print.example.org'),
    ).toBe(environment);
  });

  it('loads /api/client-config and falls back when it fails', async () => {
    const ok = respond(Response.json({ msal }));
    await expect(
      loadClientEnvironment(ok, 'http://localhost:4200'),
    ).resolves.toEqual({
      msal: {
        ...msal,
        redirectUri: 'http://localhost:4200/auth/callback',
      },
    });
    expect(ok).toHaveBeenCalledWith('/api/client-config', {
      cache: 'no-cache',
    });

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      loadClientEnvironment(
        respond(new Response('', { status: 500 })),
        'http://localhost:4200',
      ),
    ).resolves.toBe(environment);
  });
});
