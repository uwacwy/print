import {
  type HttpHandler,
  HttpHeaders,
  HttpRequest,
} from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MsalInterceptor,
  MsalService,
} from '@azure/msal-angular';
import { of } from 'rxjs';

import { SignedInMsalInterceptor } from './signed-in-msal.interceptor';

describe('SignedInMsalInterceptor', () => {
  const setup = (accounts: unknown[], platform = 'browser') => {
    const inner = { intercept: vi.fn(() => of()) };
    const next: HttpHandler = { handle: vi.fn(() => of()) };
    TestBed.configureTestingModule({
      providers: [
        SignedInMsalInterceptor,
        { provide: PLATFORM_ID, useValue: platform },
        { provide: MsalInterceptor, useValue: inner },
        {
          provide: MsalService,
          useValue: {
            instance: { getAllAccounts: () => accounts },
          },
        },
      ],
    });
    return {
      inner,
      interceptor: TestBed.inject(SignedInMsalInterceptor),
      next,
    };
  };
  const request = (headers = new HttpHeaders()) =>
    new HttpRequest('GET', '/api/printers', { headers });

  it('adds the Entra token for signed-in users', () => {
    const { inner, interceptor, next } = setup([{}]);
    interceptor.intercept(request(), next);
    expect(inner.intercept).toHaveBeenCalled();
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('leaves anonymous requests, server renders, and explicit credentials alone', () => {
    for (const [accounts, platform, headers] of [
      [[], 'browser', new HttpHeaders()],
      [[{}], 'server', new HttpHeaders()],
      [
        [{}],
        'browser',
        new HttpHeaders({ authorization: 'Pin 111-222-333' }),
      ],
    ] as const) {
      TestBed.resetTestingModule();
      const { inner, interceptor, next } = setup(
        [...accounts],
        platform,
      );
      interceptor.intercept(request(headers), next);
      expect(inner.intercept).not.toHaveBeenCalled();
      expect(next.handle).toHaveBeenCalled();
    }
  });
});
