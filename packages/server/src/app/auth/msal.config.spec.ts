import { InteractionType } from '@azure/msal-browser';
import { describe, expect, it } from 'vitest';
import { environment as developmentEnvironment } from '../../environments/environment.development';
import {
  getApiScope,
  getMsalConfiguration,
  getMsalGuardConfiguration,
  getMsalInterceptorConfiguration,
} from './msal.config';

describe('MSAL configuration', () => {
  it('uses the SPA redirect configuration and an organizational authority', () => {
    const config = getMsalConfiguration(developmentEnvironment);

    expect(config.auth?.clientId).toBe(
      developmentEnvironment.msal.clientId,
    );
    expect(config.auth?.redirectUri).toBe(
      developmentEnvironment.msal.redirectUri,
    );
    expect(config.auth?.authority).toContain(
      'login.microsoftonline.com',
    );
  });

  it('requests the registered API scope with OIDC scopes and protects API requests', () => {
    const scope = getApiScope(developmentEnvironment);
    const guard = getMsalGuardConfiguration(developmentEnvironment);
    const interceptor = getMsalInterceptorConfiguration(
      developmentEnvironment,
    );

    expect(guard.interactionType).toBe(InteractionType.Redirect);
    expect(scope).toBe(
      'api://d03ea7d5-7c58-49f3-888e-1d2ac1500b0b/Printers.Manage',
    );
    expect(guard.authRequest).toEqual({
      scopes: ['openid', 'profile', scope],
    });
    expect(
      interceptor.protectedResourceMap.get(
        'http://localhost:4200/api/*',
      ),
    ).toEqual([scope]);
  });

  it('uses OIDC-only login scopes when no API scope is configured', () => {
    const noApiEnvironment = {
      ...developmentEnvironment,
      msal: {
        ...developmentEnvironment.msal,
        apiScope: undefined,
      },
    };
    const guard = getMsalGuardConfiguration(noApiEnvironment);
    const interceptor =
      getMsalInterceptorConfiguration(noApiEnvironment);

    expect(guard.authRequest).toEqual({
      scopes: ['openid', 'profile'],
    });
    expect(interceptor.protectedResourceMap.size).toBe(0);
  });
});
