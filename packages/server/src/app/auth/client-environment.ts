import { InjectionToken } from '@angular/core';
import {
  $,
  ClientConfig,
  parseWith,
} from '@uwacwy/print-shared';

import { environment } from '../../environments/environment';

/** Sign-in settings for this deployment; `main.ts` provides the server's runtime values. */
export const CLIENT_ENVIRONMENT =
  new InjectionToken<ClientConfig>('CLIENT_ENVIRONMENT', {
    factory: () => environment,
    providedIn: 'root',
  });

/** Fetches `GET /api/client-config` before bootstrap so prebuilt bundles work for any tenant. */
export function loadClientEnvironment(
  fetchConfig: typeof fetch = fetch,
  origin = globalThis.location.origin,
): Promise<ClientConfig> {
  return fetchConfig($.api.clientConfig(), { cache: 'no-cache' })
    .then((response) =>
      response.ok
        ? (response.json() as Promise<unknown>)
        : Promise.reject(new Error(`HTTP ${response.status}`)),
    )
    .then(parseWith(ClientConfig))
    .then((config) => resolveClientConfig(config, origin))
    .catch((error: unknown) => {
      console.warn('Using built-in sign-in settings:', error);
      return environment;
    });
}

/** Prefers the server's runtime settings; falls back to the build-time environment's sign-in. */
export function resolveClientConfig(
  config: ClientConfig,
  origin: string,
  fallback: ClientConfig = environment,
): ClientConfig {
  const msal = config.msal ?? fallback.msal;
  return {
    ...config,
    ...(msal && {
      msal: { ...msal, redirectUri: `${origin}/auth/callback` },
    }),
  };
}
