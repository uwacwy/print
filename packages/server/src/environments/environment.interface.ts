export interface PrintServerClientEnvironment {
  msal: {
    tenantId: string;
    clientId: string;
    redirectUri: string;
    authority?: string;
    apiScope?: string;
  };
}
