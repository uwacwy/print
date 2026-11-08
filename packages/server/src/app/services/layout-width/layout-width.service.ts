import { computed, inject, Service, signal } from '@angular/core';
import {
  takeUntilDestroyed,
  toSignal,
} from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
} from '@angular/router';
import { catchError, filter, map, of } from 'rxjs';
import { ColWidths } from '../../../api/helpers/zod';



@Service()
export class LayoutWidthService {
  readonly #widths = signal<ColWidths>({
    xs: null,
    sm: null,
    md: null,
    lg: null,
    xl: null,
  });
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);

  readonly width = this.#widths.asReadonly();

  readonly class = computed(() => {
    const widths = this.#widths();

    const classesToApply = [];

    if (widths.xs) {
      classesToApply.push(`col-${widths.xs}`);
    }
    if (widths.sm) {
      classesToApply.push(`col-sm-${widths.sm}`);
    }
    if (widths.md) {
      classesToApply.push(`col-md-${widths.md}`);
    }
    if (widths.lg) {
      classesToApply.push(`col-lg-${widths.lg}`);
    }
    if (widths.xl) {
      classesToApply.push(`col-xl-${widths.xl}`);
    }

    return classesToApply.join(' ') || 'col';
  });

  readonly paramMap = toSignal(this.#route.paramMap, {
    requireSync: true,
  });

  readonly #leafRoute$ = this.#router.events.pipe(
    filter((e) => e instanceof NavigationEnd),
    map(() => {
      let route = this.#router.routerState.snapshot.root;
      while (route.firstChild) {
        route = route.firstChild;
      }
      return route;
    }),
    takeUntilDestroyed(),
  );

  readonly widthSub = this.#leafRoute$
    .pipe(
      map((route) => route.data),
      map((data) => ColWidths.parse(data['width'])),
      catchError(() =>
        of({
          xs: null,
          sm: null,
          md: null,
          lg: null,
          xl: null,
        }),
      ),
    )
    .subscribe({
      next: (width) => this.patchWidth(width),
    });

  // null => 'col'
  // 1-12 => 'col-{width}'
  // else => do nothing
  patchWidth(patch: Partial<ColWidths>) {
    this.#widths.update((w) => ({ ...w, ...patch }));
  }
}
