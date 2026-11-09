import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutWidthService } from './services/layout-width/layout-width.service';
import { CLIENT_ENVIRONMENT } from './auth/client-environment';
import { SiteLogoComponent } from './components/site-logo/site-logo.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteLogoComponent],
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
  readonly config = inject(CLIENT_ENVIRONMENT);
  readonly class = this.#layout.class;

  protected readonly title = signal('example-ui');
}
