import { describe, expect, it } from 'vitest';

import { ClientConfig } from './client-config';

const base = {
  enrollment: true,
  site: {
    organizationName: 'Example Org',
    showAttribution: true,
    title: 'Print',
    url: 'https://print.contoso.com/',
  },
} satisfies ClientConfig;

describe('ClientConfig', () => {
  it('accepts a config without sign-in or logo', () => {
    expect(ClientConfig.parse(base)).toEqual(base);
  });

  it('accepts msal and logo', () => {
    const full = {
      ...base,
      msal: {
        apiScope: 'api://x/access',
        authority: 'https://login.example/tenant',
        clientId: 'c',
        tenantId: 't',
      },
      site: {
        ...base.site,
        links: [{ label: 'Privacy', url: '/privacy' }],
        logo: { alt: 'Logo', url: '/logo.svg' },
      },
    } satisfies ClientConfig;
    expect(ClientConfig.parse(full)).toEqual(full);
  });

  it('defaults site.showAttribution to true', () => {
    const { showAttribution: _, ...site } = base.site;
    expect(
      ClientConfig.parse({ ...base, site }).site.showAttribution,
    ).toBe(true);
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
