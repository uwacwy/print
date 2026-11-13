import { isPlatformBrowser } from '@angular/common';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import {
  provideRouter,
  withComponentInputBinding,
  withRouterResources,
} from '@angular/router';
import { MsalBroadcastService } from '@azure/msal-angular';
import {
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalGuard,
  MsalInterceptor,
  MsalService,
} from '@azure/msal-angular';
import { PublicClientApplication } from '@azure/msal-browser';
import { firstValueFrom, switchMap, tap } from 'rxjs';

import { routes } from './app.routes';
import { CLIENT_ENVIRONMENT } from './auth/client-environment';
import {
  getMsalConfiguration,
  getMsalGuardConfiguration,
  getMsalInterceptorConfiguration,
} from './auth/msal.config';
import { SignedInMsalInterceptor } from './auth/signed-in-msal.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterResources(),
    ),
    provideClientHydration(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: MSAL_INSTANCE,
      useFactory: () =>
        new PublicClientApplication(
          getMsalConfiguration(inject(CLIENT_ENVIRONMENT)),
        ),
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: () =>
        getMsalGuardConfiguration(inject(CLIENT_ENVIRONMENT)),
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useFactory: () =>
        getMsalInterceptorConfiguration(
          inject(CLIENT_ENVIRONMENT),
        ),
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService,
    MsalInterceptor,
    {
      multi: true,
      provide: HTTP_INTERCEPTORS,
      useClass: SignedInMsalInterceptor,
    },
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const msal = inject(MsalService);
      return firstValueFrom(
        msal.initialize().pipe(
          switchMap(() => msal.handleRedirectObservable()),
          tap((result) => {
            const account =
              result?.account ??
              msal.instance.getActiveAccount() ??
              msal.instance.getAllAccounts()[0];
            if (account) {
              msal.instance.setActiveAccount(account);
            }
          }),
        ),
      );
    }),
  ],
};
