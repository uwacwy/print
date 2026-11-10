import type {
  MsalGuardConfiguration,
  MsalInterceptorConfiguration,
} from '@azure/msal-angular';
import type { Configuration } from '@azure/msal-browser';

import { InteractionType } from '@azure/msal-browser';

import type { PrintServerClientEnvironment } from '../../environments/environment.interface';

import { environment } from '../../environments/environment';

export function getApiScope(
  clientEnvironment: PrintServerClientEnvironment = environment,
): string | undefined {
  return clientEnvironment.msal.apiScope?.trim() || undefined;
}

export function getMsalConfiguration(
  clientEnvironment: PrintServerClientEnvironment = environment,
): Configuration {
  return {
    auth: {
      authority:
        clientEnvironment.msal.authority ??
        'https://login.microsoftonline.com/organizations',
      clientId: clientEnvironment.msal.clientId,
      postLogoutRedirectUri: clientEnvironment.msal.redirectUri,
      redirectUri: clientEnvironment.msal.redirectUri,
    },
    // Shared across tabs so print links opened from the manage pages (target="_blank") stay signed in.
    cache: {
      cacheLocation: 'localStorage',
    },
  };
}

export function getMsalGuardConfiguration(
  clientEnvironment: PrintServerClientEnvironment = environment,
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
  clientEnvironment: PrintServerClientEnvironment = environment,
): MsalInterceptorConfiguration {
  const scope = getApiScope(clientEnvironment);
  const protectedResourceMap = new Map<string, string[]>();
  const redirectUri = clientEnvironment.msal.redirectUri;
  if (scope && URL.canParse(redirectUri)) {
    const apiOrigin = new URL(redirectUri).origin;
    protectedResourceMap.set(`${apiOrigin}/api/*`, [scope]);
  }
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap,
    strictMatching: false,
  };
}
