import { PrintServerClientEnvironment } from './environment.interface';

export const environment: PrintServerClientEnvironment = {
  msal: {
    apiScope:
      'api://d03ea7d5-7c58-49f3-888e-1d2ac1500b0b/Printers.Manage',
    authority:
      'https://login.microsoftonline.com/f770dac3-b406-4508-9dbb-f91322fd44d2',
    clientId: 'd03ea7d5-7c58-49f3-888e-1d2ac1500b0b',
    redirectUri: 'http://localhost:4200/auth/callback',
    tenantId: 'f770dac3-b406-4508-9dbb-f91322fd44d2',
  },
};
