import type { SiteLogo } from '@uwacwy/print-shared';

export interface PrintServerClientEnvironment {
  /** The server can mint enrollment tokens (`PUBLIC_URL` is set); from `GET /api/client-config`. */
  enrollment?: boolean;
  /** Header logo; from `GET /api/client-config`. */
  logo?: SiteLogo;
  msal: {
    apiScope?: string;
    authority?: string;
    clientId: string;
    redirectUri: string;
    tenantId: string;
  };
}
