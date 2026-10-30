import {
  Component,
  computed,
  inject,
  Service,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

@Service()
export class LayoutWidthService {
  readonly #width = signal<null | number>(null);
  readonly #router = inject(Router);

  readonly width = this.#width.asReadonly();

  readonly class = computed(() =>
    this.#width() ? `col-${this.#width()}` : 'col',
  );

  // A root service's injected ActivatedRoute is the root route (data is always {}),
  // so read the deepest activated route's data after each navigation instead.
  readonly routeSub = this.#router.events
    .pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => {
        let route = this.#router.routerState.snapshot.root;
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route.data;
      }),
      takeUntilDestroyed(),
    )
    .subscribe((data) => {
      const width = data['width'];
      this.setWidth(typeof width === 'number' ? width : null);
    });

  // null => 'col'
  // 1-12 => 'col-{width}'
  // else => do nothing
  setWidth(width: number | null) {
    this.#width.set(width);
  }
}

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
              <h1>United Way Quick Print</h1>
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
  readonly class = this.#layout.class;

  protected readonly title = signal('example-ui');
}
