import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { AuthenticatedComponent } from './components/authenticated/authenticated.component';
import { ManagePrinterComponent } from './components/manage-printer/manage-printer.component';
import { ManagePrintersComponent } from './components/manage-printers/manage-printers.component';
import { NotFound } from './components/not-found/not-found';
import { PrintComponent } from './components/print/print.component';
import { PrinterQrComponent } from './components/printer-qr/printer-qr.component';
import { WelcomeComponent } from './components/welcome/welcome.component';

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
        md: 6,
        lg: 4,
        xl: 3,
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
