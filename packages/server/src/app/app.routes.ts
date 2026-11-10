import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { AuthenticatedComponent } from './pages/authenticated/authenticated.component';
import { ManagePrinterComponent } from './pages/manage-printer/manage-printer.component';
import { ManagePrintersComponent } from './pages/manage-printers/manage-printers.component';
import { NotFound } from './pages/not-found/not-found';
import { PrintComponent } from './pages/print/print.component';
import { PrinterQrComponent } from './pages/printer-qr/printer-qr.component';
import { WelcomeComponent } from './pages/welcome/welcome.component';

export const routes: Routes = [
  { path: 'auth/callback', pathMatch: 'full', redirectTo: '' },
  {
    component: WelcomeComponent,
    data: {
      width: {
        lg: 8,
        md: 8,
        sm: 12,
        xl: 6,
        xs: 12,
      },
    },
    path: '',
    title: 'Welcome',
  },
  {
    component: PrintComponent,
    data: {
      width: {
        lg: 8,
        md: 12,
        sm: 12,
        xl: 6,
        xs: 12,
      },
    },
    path: 'print/:slug',
    title: 'Print Documents',
  },
  {
    canActivate: [MsalGuard],
    canActivateChild: [MsalGuard],
    children: [
      {
        component: ManagePrintersComponent,
        path: '',
        pathMatch: 'full',
        title: 'Manage Printers',
      },
      {
        component: PrinterQrComponent,
        path: ':slug/qr',
        title: 'Printer QR Codes',
      },
      {
        component: ManagePrinterComponent,
        path: ':slug',
        title: 'Manage Printer',
      },
    ],
    component: AuthenticatedComponent,
    path: 'manage',
  },
  { component: NotFound, path: '**' },
];
