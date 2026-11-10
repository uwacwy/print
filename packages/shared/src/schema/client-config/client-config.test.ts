import { describe, expect, it } from 'vitest';

import { ClientConfig } from './client-config';

const base = {
  enrollment: true,
  publicUrl: 'https://print.example.org/',
};

describe('ClientConfig', () => {
  it('accepts a config without sign-in or logo', () => {
    expect(ClientConfig.parse(base)).toEqual(base);
  });

  it('accepts msal and logo', () => {
    const full = {
      ...base,
      logo: { alt: 'Logo', src: '/logo.svg' },
      msal: {
        apiScope: 'api://x/access',
        authority: 'https://login.example/tenant',
        clientId: 'c',
        tenantId: 't',
      },
    };
    expect(ClientConfig.parse(full)).toEqual(full);
  });

  it('rejects an incomplete msal block', () => {
    expect(
      ClientConfig.safeParse({
        ...base,
        msal: { clientId: 'c' },
      }).success,
    ).toBe(false);
  });
});
