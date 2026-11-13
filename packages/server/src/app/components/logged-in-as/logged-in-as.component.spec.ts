import { TestBed } from '@angular/core/testing';
import {
  MsalBroadcastService,
  MsalService,
} from '@azure/msal-angular';
import { type AccountInfo } from '@azure/msal-browser';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { LoggedInAsComponent } from './logged-in-as.component';

function render(account: null | Partial<AccountInfo>) {
  const logoutRedirect = vi.fn();
  TestBed.configureTestingModule({
    imports: [LoggedInAsComponent],
    providers: [
      {
        provide: MsalBroadcastService,
        useValue: { inProgress$: EMPTY },
      },
      {
        provide: MsalService,
        useValue: {
          instance: {
            getActiveAccount: () => account,
            getAllAccounts: () => [],
          },
          logoutRedirect,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoggedInAsComponent);
  fixture.detectChanges();
  return {
    element: fixture.nativeElement as HTMLElement,
    logoutRedirect,
  };
}

describe('LoggedInAsComponent', () => {
  it('names the signed-in user', () => {
    const { element } = render({ username: 'ada@contoso.com' });
    expect(element.textContent).toContain(
      'Logged in as ada@contoso.com',
    );
  });

  it('renders nothing without an account', () => {
    const { element } = render(null);
    expect(element.querySelector('p')).toBeNull();
  });

  it('signs out through MSAL without following the link', () => {
    const account = { username: 'ada@contoso.com' };
    const { element, logoutRedirect } = render(account);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    element.querySelector('a')!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(logoutRedirect).toHaveBeenCalledWith({ account });
  });
});
