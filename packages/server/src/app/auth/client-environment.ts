import { InjectionToken } from '@angular/core';
import type { ClientConfig } from '@uwacwy/print-shared';
import { createRouting } from 'ts-routes';
import { environment } from '../../environments/environment';
import type { PrintServerClientEnvironment } from '../../environments/environment.interface';
import { root } from '../../shared/routes/routes';

const $ = createRouting(root);

/** Sign-in settings for this deployment; `main.ts` provides the server's runtime values. */
export const CLIENT_ENVIRONMENT =
  new InjectionToken<PrintServerClientEnvironment>(
    'CLIENT_ENVIRONMENT',
    {
      providedIn: 'root',
      factory: () => environment,
    },
  );

/** Prefers the server's runtime settings; falls back to the build-time environment. */
export function toClientEnvironment(
  config: ClientConfig,
  origin: string,
  fallback: PrintServerClientEnvironment = environment,
): PrintServerClientEnvironment {
  return config.msal
    ? {
        msal: {
          ...config.msal,
          redirectUri: `${origin}/auth/callback`,
        },
        enrollment: config.enrollment,
        logo: config.logo,
      }
    : { ...fallback, enrollment: config.enrollment, logo: config.logo };
}

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
