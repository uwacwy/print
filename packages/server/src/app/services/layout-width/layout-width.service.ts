import { computed, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import z from 'zod';

// type ColWidths = {
//   xs: number | null;
//   sm: number | null;
//   md: number | null;
//   lg: number | null;
//   xl: number | null;
// };
const ColWidths = z.object({
  xs: z.number().nullable(),
  sm: z.number().nullable(),
  md: z.number().nullable(),
  lg: z.number().nullable(),
  xl: z.number().nullable(),
});

type ColWidths = z.infer<typeof ColWidths>;

@Service()
export class LayoutWidthService {
  readonly #widths = signal<ColWidths>({
    xs: null,
    sm: null,
    md: null,
    lg: null,
    xl: null,
  });
  readonly #router = inject(Router);

  readonly width = this.#widths.asReadonly();

  readonly class = computed(() => {
    const classesToApply = [];
    const widths = this.#widths();
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
  setWidth(
    xs: number | null = null,
    sm: number | null = null,
    md: number | null = null,
    lg: number | null = null,
    xl: number | null = null,
  ) {
    this.#widths.set({ xs, sm, md, lg, xl });
  }
}
