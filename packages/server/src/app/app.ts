import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutWidthService } from './services/layout-width/layout-width.service';
import { CLIENT_ENVIRONMENT } from './auth/client-environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.scss',
  template: `
    <main class="container my-4">
      <div class="row">
        <div class="{{ class() }} mx-auto">
          <div class="row">
            <div>
              <h1>{{ 'United Way Quick Print' }}</h1>
            </div>
          </div>
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
