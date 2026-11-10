import type { ClientConfig } from '@uwacwy/print-shared';

import { InjectionToken } from '@angular/core';
import { $ } from '@uwacwy/print-shared';

import type { PrintServerClientEnvironment } from '../../environments/environment.interface';

import { environment } from '../../environments/environment';

/** Sign-in settings for this deployment; `main.ts` provides the server's runtime values. */
export const CLIENT_ENVIRONMENT =
  new InjectionToken<PrintServerClientEnvironment>(
    'CLIENT_ENVIRONMENT',
    {
      factory: () => environment,
      providedIn: 'root',
    },
  );

/** Fetches `GET /api/client-config` before bootstrap so prebuilt bundles work for any tenant. */
export function loadClientEnvironment(
  fetchConfig: typeof fetch = fetch,
  origin = globalThis.location.origin,
): Promise<PrintServerClientEnvironment> {
  return fetchConfig($.api.clientConfig(), { cache: 'no-cache' })
    .then((response) =>
      response.ok
        ? (response.json() as Promise<ClientConfig>)
        : Promise.reject(new Error(`HTTP ${response.status}`)),
    )
    .then((config) => toClientEnvironment(config, origin))
    .catch((error: unknown) => {
      console.warn('Using built-in sign-in settings:', error);
      return environment;
    });
}

/** Prefers the server's runtime settings; falls back to the build-time environment. */
export function toClientEnvironment(
  config: ClientConfig,
  origin: string,
  fallback: PrintServerClientEnvironment = environment,
): PrintServerClientEnvironment {
  return config.msal
    ? {
        enrollment: config.enrollment,
        logo: config.logo,
        msal: {
          ...config.msal,
          redirectUri: `${origin}/auth/callback`,
        },
      }
    : {
        ...fallback,
        enrollment: config.enrollment,
        logo: config.logo,
      };
}
