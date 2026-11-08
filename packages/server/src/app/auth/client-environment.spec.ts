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
      toClientEnvironment(
        { msal, enrollment: true },
        'https://print.example.org',
      ),
    ).toEqual({
      msal: {
        ...msal,
        redirectUri: 'https://print.example.org/auth/callback',
      },
      enrollment: true,
    });
  });

  it('falls back to the build-time sign-in when the server has none', () => {
    expect(
      toClientEnvironment(
        { enrollment: false },
        'https://print.example.org',
      ),
    ).toEqual({ ...environment, enrollment: false });
  });

  it('loads /api/client-config and falls back when it fails', async () => {
    const ok = respond(Response.json({ msal, enrollment: false }));
    await expect(
      loadClientEnvironment(ok, 'http://localhost:4200'),
    ).resolves.toEqual({
      msal: {
        ...msal,
        redirectUri: 'http://localhost:4200/auth/callback',
      },
      enrollment: false,
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
