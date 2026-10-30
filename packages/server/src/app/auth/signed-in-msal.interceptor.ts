import { isPlatformBrowser } from '@angular/common';
import type {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { MsalInterceptor, MsalService } from '@azure/msal-angular';
import type { Observable } from 'rxjs';

/**
 * Adds the Entra access token only for signed-in users and only when the request carries no
 * credential of its own, so upload tokens and PINs pass through and anonymous visitors are
 * never redirected to sign in.
 */
@Injectable()
export class SignedInMsalInterceptor implements HttpInterceptor {
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #msal = inject(MsalService);
  readonly #inner = inject(MsalInterceptor);

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    const delegate =
      this.#browser &&
      !request.headers.has('authorization') &&
      this.#msal.instance.getAllAccounts().length > 0;
    return delegate
      ? this.#inner.intercept(request, next)
      : next.handle(request);
  }
}
