import type { ClientConfig } from '@uwacwy/print-shared';

/** Placeholder sign-in settings; the server's `GET /api/client-config` replaces them at startup. */
export const environment = {
  enrollment: false,
  msal: {
    apiScope:
      'api://11111111-1111-4111-8111-111111111111/Printers.Manage',
    authority:
      'https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222',
    clientId: '11111111-1111-4111-8111-111111111111',
    redirectUri: 'https://print.contoso.com/auth/callback',
    tenantId: '22222222-2222-4222-8222-222222222222',
  },
  publicUrl: 'https://print.contoso.com',
} satisfies ClientConfig;
