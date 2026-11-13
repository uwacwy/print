import { Route } from '@angular/router';

export const printComponentRoute = {
  data: {
    width: {
      lg: 8,
      md: 12,
      sm: 12,
      xl: 6,
      xs: 12,
    },
  },
  loadComponent: () =>
    import('./print.component').then((m) => m.PrintComponent),
  path: 'print/:slug',
} satisfies Route;
