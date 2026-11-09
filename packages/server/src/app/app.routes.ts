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
    path: '',
    component: WelcomeComponent,
    title: 'Welcome',
    data: {
      width: {
        xs: 12,
        sm: 12,
        md: 8,
        lg: 8,
        xl: 6,
      },
    },
  },
  {
    path: 'print/:slug',
    component: PrintComponent,
    title: 'Print Documents',
    data: {
      width: {
        xs: 12,
        sm: 12,
        md: 12,
        lg: 8,
        xl: 6,
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
        title: 'Printer QR Codes',
      },
      {
        path: ':slug',
        component: ManagePrinterComponent,
        title: 'Manage Printer',
      },
    ],
  },
  { path: '**', component: NotFound },
];
