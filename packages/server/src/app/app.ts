import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import pkg from '../../../../package.json';
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
            <h1 class="mb-0">
              {{ config.brand.siteTitle }}
            </h1>
          </header>
          <div class="row">
            <div>
              <router-outlet></router-outlet>
            </div>
          </div>
          <hr />
          <footer class="text-center text-muted">
            <small>
              <ul class="list-inline mb-0">
                <li class="list-inline-item">
                  &copy;{{ now.getFullYear() }}
                  {{ config.legal.organizationName }}
                </li>
                @if (config.brand.links) {
                  @for (
                    link of config.brand.links;
                    track $index
                  ) {
                    <li class="list-inline-item">
                      <a
                        href="{{ link.url }}"
                        class="text-muted"
                        >{{ link.label }}</a
                      >
                    </li>
                  }
                }
              </ul>
              @if (config.showAttribution) {
                <p class="font-monospace">
                  <a
                    href="https://npmjs.com/package/{{
                      pkgName
                    }}"
                    class="text-muted"
                    >{{ pkgName }}</a
                  >
                  {{ pkgVersion }}
                </p>
              }
            </small>
          </footer>
        </div>
      </div>
    </main>
  `,
})
export class App {
  readonly #layout = inject(LayoutWidthService);
  readonly class = this.#layout.class;
  readonly config = inject(CLIENT_ENVIRONMENT);
  readonly now = new Date();
  readonly pkgName = pkg.name;
  readonly pkgVersion = pkg.version;

  protected readonly title = signal('example-ui');
}
