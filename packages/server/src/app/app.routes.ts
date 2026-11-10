import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

export const routes: Routes = [
  { path: 'auth/callback', pathMatch: 'full', redirectTo: '' },
  {
    data: {
      width: {
        lg: 8,
        md: 8,
        sm: 12,
        xl: 6,
        xs: 12,
      },
    },
    loadComponent: () =>
      import('./pages/welcome/welcome.component').then(
        (m) => m.WelcomeComponent,
      ),
    path: '',
    title: $localize`:@@route.welcome.title:Welcome`,
  },
  {
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
      import('./pages/print/print.component').then(
        (m) => m.PrintComponent,
      ),
    path: 'print/:slug',
    title: $localize`:@@route.print.title:Print Documents`,
  },
  {
    canActivate: [MsalGuard],
    canActivateChild: [MsalGuard],
    children: [
      {
        loadComponent: () =>
          import('./pages/manage-printers/manage-printers.component').then(
            (m) => m.ManagePrintersComponent,
          ),
        path: '',
        pathMatch: 'full',
        title: $localize`:@@route.manage-printers.title:Manage Printers`,
      },
      {
        loadComponent: () =>
          import('./pages/printer-qr/printer-qr.component').then(
            (m) => m.PrinterQrComponent,
          ),
        path: ':slug/qr',
        title: $localize`:@@route.printer-qr.title:Printer QR Codes`,
      },
      {
        loadComponent: () =>
          import('./pages/manage-printer/manage-printer.component').then(
            (m) => m.ManagePrinterComponent,
          ),
        path: ':slug',
        title: $localize`:@@route.manage-printer.title:Manage Printer`,
      },
    ],
    loadComponent: () =>
      import('./pages/authenticated/authenticated.component').then(
        (m) => m.AuthenticatedComponent,
      ),
    path: 'manage',
  },
  {
    loadComponent: () =>
      import('./pages/not-found/not-found').then(
        (m) => m.NotFound,
      ),
    path: '**',
  },
];
