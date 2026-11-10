import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import {} from '@azure/msal-browser';
import {} from 'rxjs';

import { activeAccount } from '../../auth/active-account/active-account';

@Component({
  imports: [RouterOutlet],
  selector: 'app-authenticated',
  template: `
    <header>
      @if (username(); as name) {
        <p i18n="@@authenticated.logged-in-as-middot">
          Logged in as {{ name }} &middot;
          <a href="#" (click)="signOut($event)">Sign Out</a>
        </p>
      }
    </header>
    <section>
      <router-outlet></router-outlet>
    </section>
  `,
})
export class AuthenticatedComponent {
  // Re-read the active account whenever an MSAL interaction finishes.
  readonly #account = activeAccount();

  protected readonly username = computed(
    () => this.#account()?.username ?? '',
  );

  readonly #msal = inject(MsalService);

  protected signOut(event: Event): void {
    event.preventDefault();
    this.#msal.logoutRedirect({
      account: this.#account() ?? undefined,
    });
  }
}
