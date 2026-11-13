import { Component, computed, inject } from '@angular/core';
import { MsalService } from '@azure/msal-angular';

import { activeAccount } from '../../auth/active-account/active-account';

/** "Logged in as …" with a sign-out link; renders nothing without a signed-in account. */
@Component({
  selector: 'app-logged-in-as',
  template: `
    @if (username(); as name) {
      <p i18n="@@authenticated.logged-in-as-middot">
        Logged in as {{ name }} &middot;
        <a href="#" (click)="signOut($event)">Sign Out</a>
      </p>
    }
  `,
})
export class LoggedInAsComponent {
  // Re-read the active account whenever an MSAL interaction finishes.
  readonly #account = activeAccount();

  readonly #msal = inject(MsalService);

  protected readonly username = computed(
    () => this.#account()?.username ?? '',
  );

  protected signOut(event: Event): void {
    event.preventDefault();
    this.#msal.logoutRedirect({
      account: this.#account() ?? undefined,
    });
  }
}
