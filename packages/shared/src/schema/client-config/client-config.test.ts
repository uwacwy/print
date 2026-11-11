import { describe, expect, it } from 'vitest';

import { ClientConfig } from './client-config';

const base = {
  brand: { siteTitle: 'Print' },
  enrollment: true,
  legal: { organizationName: 'Example Org' },
  publicUrl: 'https://print.example.org/',
  showAttribution: true,
};

describe('ClientConfig', () => {
  it('accepts a config without sign-in or logo', () => {
    expect(ClientConfig.parse(base)).toEqual(base);
  });

  it('accepts msal and logo', () => {
    const full = {
      ...base,
      brand: {
        links: [{ label: 'Privacy', url: '/privacy' }],
        logo: { alt: 'Logo', src: '/logo.svg' },
        siteTitle: 'Print',
      },
      msal: {
        apiScope: 'api://x/access',
        authority: 'https://login.example/tenant',
        clientId: 'c',
        tenantId: 't',
      },
    };
    expect(ClientConfig.parse(full)).toEqual(full);
  });

  it('defaults showAttribution to true', () => {
    const { showAttribution: _, ...rest } = base;
    expect(ClientConfig.parse(rest).showAttribution).toBe(true);
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
