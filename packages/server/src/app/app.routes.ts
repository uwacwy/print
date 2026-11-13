import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { CLIENT_ENVIRONMENT } from './auth/client-environment';
import { printComponentRoute } from './pages/print/print.component.route';

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
    // title: $localize`:@@route.welcome.title:Quick Print`,
    title: () => {
      const config = inject(CLIENT_ENVIRONMENT);
      return [
        config.site.title,
        config.site.organizationName,
      ].join(' - ');
    },
  },
  printComponentRoute,
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
