import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MsalBroadcastService } from '@azure/msal-angular';
import { isPlatformBrowser } from '@angular/common';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  type HttpInterceptor,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideRouter } from '@angular/router';
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
import { provideClientHydration } from '@angular/platform-browser';
import {
  getMsalConfiguration,
  getMsalGuardConfiguration,
  getMsalInterceptorConfiguration,
} from './auth/msal.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: MSAL_INSTANCE,
      useFactory: () => new PublicClientApplication(getMsalConfiguration()),
    },
    { provide: MSAL_GUARD_CONFIG, useValue: getMsalGuardConfiguration() },
    { provide: MSAL_INTERCEPTOR_CONFIG, useValue: getMsalInterceptorConfiguration() },
    MsalService,
    MsalGuard,
    MsalBroadcastService,
    { provide: HTTP_INTERCEPTORS, useClass: MsalInterceptor, multi: true },
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
      const msal = inject(MsalService);
      return firstValueFrom(
        msal.initialize().pipe(
          switchMap(() => msal.handleRedirectObservable()),
          tap((result) => {
            const account =
              result?.account ??
              msal.instance.getActiveAccount() ??
              msal.instance.getAllAccounts()[0];
            if (account) msal.instance.setActiveAccount(account);
          }),
        ),
      );
    }),
  ],
};
