import type { Request } from 'express';

import { decodeJwt, decodeProtectedHeader } from 'jose';
import jwksClient from 'jwks-rsa';
import {
  Strategy as JwtStrategy,
  type SecretOrKeyProvider,
  type VerifiedCallback,
} from 'passport-jwt';
import { Strategy } from 'passport-strategy';

import { bearer, isJwtShaped } from '../credentials';
import {
  type AuthChallenge,
  isAuthChallenge,
} from '../principal';

/** Tenant, audience and keys shared by every Entra strategy. */
export interface EntraOptions {
  audience?: string | string[];
  /** Overrides the Entra JWKS lookup; tests use it to supply a local signing key. */
  keyProvider?: SecretOrKeyProvider<Request>;
  tenantId?: string;
}

type ConfiguredEntraOptions = EntraOptions &
  Required<Pick<EntraOptions, 'audience' | 'tenantId'>>;

export const challenge = (
  code: string,
  error: string,
  status: AuthChallenge['status'],
  presented: boolean,
  details?: Record<string, unknown>,
): AuthChallenge => ({
  code,
  details,
  error,
  presented,
  scheme:
    presented && status === 401
      ? 'Bearer error="invalid_token"'
      : 'Bearer',
  status,
});

export const MISSING = challenge(
  'access_token_required',
  'Sign in to continue.',
  401,
  false,
);
export const INVALID = challenge(
  'access_token_invalid',
  'Your sign-in is not valid. Sign in again.',
  401,
  true,
);
const NOT_CONFIGURED = challenge(
  'entra_not_configured',
  'Microsoft Entra sign-in is not configured on this server.',
  503,
  true,
);

/** Entra issues v1 and v2 access tokens from different issuers and key sets. */
const tokenVersion = (token: string) =>
  decodeJwt(token)['ver'] === '1.0' ? 'v1' : 'v2';

export type EntraVerify = (
  claims: Record<string, unknown>,
  done: VerifiedCallback,
) => void;

/**
 * Validates Entra access tokens issued by the tenant. Only JWT-shaped bearer tokens are
 * considered, so upload tokens fall through to their own strategy.
 */
class EntraJwtStrategy extends JwtStrategy {
  constructor(
    name: string,
    options: ConfiguredEntraOptions,
    verify: EntraVerify,
  ) {
    super(
      {
        algorithms: ['RS256'],
        audience: options.audience,
        issuer: [
          `https://sts.windows.net/${options.tenantId}/`,
          `https://login.microsoftonline.com/${options.tenantId}/v2.0`,
        ],
        jwtFromRequest: (request: Request) => {
          const token = bearer(request);
          return isJwtShaped(token) ? token : null;
        },
        secretOrKeyProvider:
          options.keyProvider ??
          entraKeyProvider(options.tenantId),
      },
      verify,
    );
    this.name = name;
  }

  /** passport-jwt fails with bare Errors; translate them into JSON-ready challenges. */
  override authenticate(
    request: Request,
    options?: object,
  ): void {
    const fail = this.fail.bind(this);
    this.fail = (info?: unknown) => {
      const translated = isAuthChallenge(info)
        ? info
        : isJwtShaped(bearer(request))
          ? INVALID
          : MISSING;
      fail(translated, translated.status);
    };
    super.authenticate(request, options);
  }
}

/** Stands in for Entra when no tenant/audience is configured. */
class EntraNotConfiguredStrategy extends Strategy {
  constructor(readonly name: string) {
    super();
  }

  override authenticate(request: Request): void {
    const challenge = isJwtShaped(bearer(request))
      ? NOT_CONFIGURED
      : MISSING;
    this.fail(challenge, challenge.status);
  }
}

function entraKeyProvider(
  tenantId: string,
): SecretOrKeyProvider<Request> {
  const base = `https://login.microsoftonline.com/${tenantId}`;
  const clients = {
    v1: jwksClient({
      cache: true,
      jwksUri: `${base}/discovery/keys`,
      rateLimit: true,
    }),
    v2: jwksClient({
      cache: true,
      jwksUri: `${base}/discovery/v2.0/keys`,
      rateLimit: true,
    }),
  };
  return (_request, rawJwt: string, done) => {
    try {
      const { kid } = decodeProtectedHeader(rawJwt);
      clients[tokenVersion(rawJwt)]
        .getSigningKey(kid)
        .then((key) => done(null, key.getPublicKey()), done);
    } catch (error) {
      done(error);
    }
  };
}

/** Configured tenants get the real strategy; others answer 503 to presented JWTs. */
export const createEntraStrategy = (
  name: string,
  { audience, tenantId, ...options }: EntraOptions,
  verify: EntraVerify,
): Strategy =>
  tenantId && audience
    ? new EntraJwtStrategy(
        name,
        { ...options, audience, tenantId },
        verify,
      )
    : new EntraNotConfiguredStrategy(name);
