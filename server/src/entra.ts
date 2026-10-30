import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
import type { EntraConfig } from './config/config.js';

export function isEntraAdmin(
  config: EntraConfig,
  principal: { email: string; groups: string[] },
): boolean {
  return (
    config.adminEmails.includes(principal.email.toLowerCase()) ||
    config.adminGroupIds.some((group) =>
      principal.groups.includes(group),
    )
  );
}

export class EntraAuth {
  private configuration: Configuration | undefined;

  constructor(
    private readonly config: EntraConfig,
    private readonly callbackUrl: URL,
  ) {}

  async initialize(): Promise<void> {
    const issuer = new URL(
      `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`,
    );
    this.configuration = await discovery(
      issuer,
      this.config.clientId,
      this.config.clientSecret,
    );
  }

  async begin(returnTo: string): Promise<{
    url: URL;
    state: string;
    nonce: string;
    verifier: string;
    expiresAt: number;
  }> {
    const configuration = this.requireConfiguration();
    const state = randomState();
    const nonce = randomNonce();
    const verifier = randomPKCECodeVerifier();
    const challenge = await calculatePKCECodeChallenge(verifier);
    const url = buildAuthorizationUrl(configuration, {
      client_id: this.config.clientId,
      redirect_uri: this.callbackUrl.toString(),
      response_type: 'code',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return {
      url,
      state,
      nonce,
      verifier,
      expiresAt: Date.now() + 10 * 60_000,
    };
  }

  async complete(
    currentUrl: URL,
    flow: { state: string; nonce: string; verifier: string },
  ): Promise<{
    sub: string;
    name: string;
    email: string;
    groups: string[];
  }> {
    const tokens = await authorizationCodeGrant(
      this.requireConfiguration(),
      currentUrl,
      {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
      },
    );
    const claims = tokens.claims();
    if (!claims?.sub || typeof claims.sub !== 'string') {
      throw new Error(
        'Microsoft Entra ID did not return a user identifier.',
      );
    }
    const preferredUsername =
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : '';
    const email =
      typeof claims.email === 'string'
        ? claims.email
        : preferredUsername;
    const name =
      typeof claims.name === 'string'
        ? claims.name
        : email || claims.sub;
    const groups = Array.isArray(claims.groups)
      ? claims.groups.filter(
          (group): group is string => typeof group === 'string',
        )
      : [];
    const principal = { sub: claims.sub, name, email, groups };
    if (!isEntraAdmin(this.config, principal)) {
      throw new Error(
        `${email || claims.sub} is not a print administrator.`,
      );
    }
    return principal;
  }

  private requireConfiguration(): Configuration {
    if (!this.configuration) {
      throw new Error('Microsoft Entra ID is not initialized.');
    }
    return this.configuration;
  }
}
