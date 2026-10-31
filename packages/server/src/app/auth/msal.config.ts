import type {
  MsalGuardConfiguration,
  MsalInterceptorConfiguration,
} from '@azure/msal-angular';
import { InteractionType } from '@azure/msal-browser';
import type { Configuration } from '@azure/msal-browser';
import { environment } from '../../environments/environment';
import type { PrintServerClientEnvironment } from '../../environments/environment.interface';

export function getMsalConfiguration(
  clientEnvironment: PrintServerClientEnvironment = environment,
): Configuration {
  return {
    auth: {
      clientId: clientEnvironment.msal.clientId,
      authority:
        clientEnvironment.msal.authority ??
        'https://login.microsoftonline.com/organizations',
      redirectUri: clientEnvironment.msal.redirectUri,
      postLogoutRedirectUri: clientEnvironment.msal.redirectUri,
    },
    // Shared across tabs so print links opened from the manage pages (target="_blank") stay signed in.
    cache: {
      cacheLocation: 'localStorage',
    },
  };
}

export function getApiScope(
  clientEnvironment: PrintServerClientEnvironment = environment,
): string | undefined {
  return clientEnvironment.msal.apiScope?.trim() || undefined;
}

export function getMsalGuardConfiguration(
  clientEnvironment: PrintServerClientEnvironment = environment,
): MsalGuardConfiguration {
  const apiScope = getApiScope(clientEnvironment);
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: ['openid', 'profile', ...(apiScope ? [apiScope] : [])],
    },
  };
}

export function getMsalInterceptorConfiguration(
  clientEnvironment: PrintServerClientEnvironment = environment,
): MsalInterceptorConfiguration {
  const scope = getApiScope(clientEnvironment);
  const protectedResourceMap = new Map();
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
