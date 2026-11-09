import type { SiteLogo } from '@uwacwy/print-shared';

export interface PrintServerClientEnvironment {
  msal: {
    tenantId: string;
    clientId: string;
    redirectUri: string;
    authority?: string;
    apiScope?: string;
  };
  /** The server can mint enrollment tokens (`PUBLIC_URL` is set); from `GET /api/client-config`. */
  enrollment?: boolean;
  /** Header logo; from `GET /api/client-config`. */
  logo?: SiteLogo;
}
