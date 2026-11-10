import type {
  MsalGuardConfiguration,
  MsalInterceptorConfiguration,
} from '@azure/msal-angular';
import type { Configuration } from '@azure/msal-browser';
import type { ClientConfig } from '@uwacwy/print-shared';

import { InteractionType } from '@azure/msal-browser';

import { environment } from '../../environments/environment';

export function getApiScope(
  clientEnvironment: ClientConfig = environment,
): string | undefined {
  return (
    (
      clientEnvironment.msal ?? environment.msal
    ).apiScope?.trim() || undefined
  );
}

export function getMsalConfiguration(
  clientEnvironment: ClientConfig = environment,
): Configuration {
  return {
    auth: {
      authority:
        (clientEnvironment.msal ?? environment.msal).authority ??
        'https://login.microsoftonline.com/organizations',
      clientId: (clientEnvironment.msal ?? environment.msal)
        .clientId,
      postLogoutRedirectUri: (
        clientEnvironment.msal ?? environment.msal
      ).redirectUri,
      redirectUri: (clientEnvironment.msal ?? environment.msal)
        .redirectUri,
    },
    // Shared across tabs so print links opened from the manage pages (target="_blank") stay signed in.
    cache: {
      cacheLocation: 'localStorage',
    },
  };
}

export function getMsalGuardConfiguration(
  clientEnvironment: ClientConfig = environment,
): MsalGuardConfiguration {
  const apiScope = getApiScope(clientEnvironment);
  return {
    authRequest: {
      scopes: [
        'openid',
        'profile',
        ...(apiScope ? [apiScope] : []),
      ],
    },
    interactionType: InteractionType.Redirect,
  };
}

export function getMsalInterceptorConfiguration(
  clientEnvironment: ClientConfig = environment,
): MsalInterceptorConfiguration {
  const scope = getApiScope(clientEnvironment);
  const protectedResourceMap = new Map<string, string[]>();
  const redirectUri = (
    clientEnvironment.msal ?? environment.msal
  ).redirectUri;
  if (scope && redirectUri && URL.canParse(redirectUri)) {
    const apiOrigin = new URL(redirectUri).origin;
    protectedResourceMap.set(`${apiOrigin}/api/*`, [scope]);
  }
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap,
    strictMatching: false,
  };
}
