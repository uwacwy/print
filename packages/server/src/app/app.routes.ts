import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { WelcomeComponent } from './components/welcome/welcome.component';
import { PrintComponent } from './components/print/print.component';
import { ManagePrinterComponent } from './components/manage-printer/manage-printer.component';
import { ManagePrintersComponent } from './components/manage-printers/manage-printers.component';
import { PrinterQrComponent } from './components/printer-qr/printer-qr.component';
import { NotFound } from './components/not-found/not-found';
import { AuthenticatedComponent } from './components/authenticated/authenticated.component';

export const routes: Routes = [
  { path: 'auth/callback', pathMatch: 'full', redirectTo: '' },
  {
    path: '',
    component: WelcomeComponent,
    data: {
      width: 6,
    },
  },
  {
    path: 'print/:slug',
    component: PrintComponent,
    data: {
      width: 6,
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
      },
      { path: ':slug/qr', component: PrinterQrComponent },
      { path: ':slug', component: ManagePrinterComponent },
    ],
  },
  { path: '**', component: NotFound },
];
