import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DOCUMENT,
  effect,
  inject,
} from '@angular/core';
import { DestroyRef, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import pkg from '../../package.json';
import { CLIENT_ENVIRONMENT } from './auth/client-environment';
import { LoggedInAsComponent } from './components/logged-in-as/logged-in-as.component';
import { StatusPillComponent } from './components/status-pill/status-pill.component';
import { LayoutWidthService } from './services/layout-width/layout-width.service';

@Component({
  imports: [
    RouterOutlet,
    RouterLink,
    StatusPillComponent,
    LoggedInAsComponent,
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  template: `
    <main class="container my-4 mx-auto">
      <div class="row">
        <div class="{{ class() }} mx-auto">
          <header>
            <div>
              @if (config.site.logo) {
                <a routerLink="/">
                  <img
                    [src]="config.site.logo.url"
                    [alt]="config.site.logo.alt"
                    priority
                  />
                </a>
              }
              <h1 [class.visually-hidden]="config.site.logo">
                {{ config.site.title }}
              </h1>
            </div>
            <div [class.text-end]="config.site.logo">
              <app-logged-in-as></app-logged-in-as>
              <app-status-pill></app-status-pill>
            </div>
          </header>
          <article>
            <router-outlet></router-outlet>
          </article>
          <footer class="text-center text-muted">
            <small>
              <ul class="list-inline mb-0">
                <li class="list-inline-item">
                  &copy;{{ now.getFullYear() }}
                  {{ config.site.organizationName }}
                </li>
                @if (config.site.links) {
                  @for (
                    link of config.site.links;
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
              @if (config.site.showAttribution) {
                <p class="font-monospace mb-0">
                  <a
                    target="_blank"
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
  readonly pkgVersion = 'v' + pkg.version;
  // listen to the user's dark mode preference
  // using an angular matchMedia listener
  readonly prefersDark = useMediaQuery(
    '(prefers-color-scheme: dark)',
  );

  readonly #document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      // set [data-bs-theme] attribute on <html>
      this.#document.documentElement.dataset['bsTheme'] =
        this.prefersDark() ? 'dark' : 'light';
    });
  }
}

export function useMediaQuery(query: string) {
  const platformId = inject(PLATFORM_ID);
  const destroyRef = inject(DestroyRef);
  const doc = inject(DOCUMENT);
  const win = doc.defaultView;

  // Return a static false signal during Server-Side Rendering (SSR)
  if (
    !isPlatformBrowser(platformId) ||
    !win ||
    !win.matchMedia
  ) {
    return signal(false).asReadonly();
  }

  const mediaQuery = win.matchMedia(query);
  const matches = signal(mediaQuery.matches);

  const listener = (event: MediaQueryListEvent) => {
    matches.set(event.matches);
  };

  mediaQuery.addEventListener('change', listener);

  // Clean up the event listener when the component/service is destroyed
  destroyRef.onDestroy(() => {
    mediaQuery.removeEventListener('change', listener);
  });

  return matches.asReadonly();
}
