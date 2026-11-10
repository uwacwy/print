import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CLIENT_ENVIRONMENT } from './auth/client-environment';
import { SiteLogoComponent } from './components/site-logo/site-logo.component';
import { LayoutWidthService } from './services/layout-width/layout-width.service';

@Component({
  imports: [RouterOutlet, SiteLogoComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  template: `
    <main class="container my-4">
      <div class="row">
        <div class="{{ class() }} mx-auto">
          <header
            class="d-flex flex-wrap align-items-center column-gap-3 row-gap-2 mb-3"
          >
            <app-site-logo />
            <h1 class="mb-0">United Way Quick Print</h1>
          </header>
          <div class="row">
            <div>
              <router-outlet></router-outlet>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
})
export class App {
  readonly #layout = inject(LayoutWidthService);
  readonly class = this.#layout.class;
  readonly config = inject(CLIENT_ENVIRONMENT);

  protected readonly title = signal('example-ui');
}
