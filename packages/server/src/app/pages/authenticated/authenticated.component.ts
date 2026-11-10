import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import {
  MsalBroadcastService,
  MsalService,
} from '@azure/msal-angular';
import { InteractionStatus } from '@azure/msal-browser';
import { filter, map, startWith } from 'rxjs';

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
  readonly #broadcast = inject(MsalBroadcastService);
  readonly #msal = inject(MsalService);

  // Re-read the active account whenever an MSAL interaction finishes.
  readonly #account = toSignal(
    this.#broadcast.inProgress$.pipe(
      filter((status) => status === InteractionStatus.None),
      startWith(InteractionStatus.None),
      map(
        () =>
          this.#msal.instance.getActiveAccount() ??
          this.#msal.instance.getAllAccounts()[0] ??
          null,
      ),
    ),
    { initialValue: null },
  );

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
