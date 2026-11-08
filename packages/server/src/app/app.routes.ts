import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { WelcomeComponent } from './components/welcome/welcome.component';
import { PrintComponent } from './components/print/print.component';
import { ManagePrinterComponent } from './components/manage-printer/manage-printer.component';
import { ManagePrintersComponent } from './components/manage-printers/manage-printers.component';
import { PrinterQrComponent } from './components/printer-qr/printer-qr.component';
import { NotFound } from './components/not-found/not-found';
import { AuthenticatedComponent } from './components/authenticated/authenticated.component';
import { computed } from '@angular/core';

export const routes: Routes = [
  { path: 'auth/callback', pathMatch: 'full', redirectTo: '' },
  {
    path: '',
    component: WelcomeComponent,
    data: {
      width: {
        xs: 12,
        sm: 12,
        md: 6,
        lg: 4,
        xl: 3,
      },
    },
  },
  {
    path: 'print/:slug',
    component: PrintComponent,
    data: {
      width: {
        xs: 12,
        sm: 12,
        md: 12,
        lg: 6,
        xl: 6,
      },
      title: {
        label: 'Print to {0}',
        placeholders: [
          (inst: PrintComponent) =>
            computed(() => inst.printer()?.name ?? inst.slug()),
          // ':slug',
        ],
      },
    },
  },
  {
    path: 'manage',
    canActivate: [MsalGuard],
    canActivateChild: [MsalGuard],
    component: AuthenticatedComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: ManagePrintersComponent,
        title: 'Manage Printers',
      },
      {
        path: ':slug/qr',
        component: PrinterQrComponent,
        title: '{0} QR Codes',
        data: {
          title: {
            label: '{0} QR Codes',
            placeholders: [
              (inst: PrinterQrComponent) => inst.printer()?.name,
            ],
          },
        },
      },
      { path: ':slug', component: ManagePrinterComponent },
    ],
  },
  { path: '**', component: NotFound },
];
