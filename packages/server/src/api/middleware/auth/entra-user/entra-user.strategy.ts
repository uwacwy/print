import type { Request } from 'express';

import { decodeJwt, decodeProtectedHeader } from 'jose';
import jwksClient from 'jwks-rsa';
import {
  Strategy as JwtStrategy,
  type SecretOrKeyProvider,
} from 'passport-jwt';
import { Strategy } from 'passport-strategy';

import { bearer, isJwtShaped } from '../credentials';
import {
  type AuthChallenge,
  isAuthChallenge,
  type Principal,
} from '../principal';

export interface EntraUserOptions {
  adminGroupIds: string[];
  adminRole?: string;
  audience?: string | string[];
  /** Overrides the Entra JWKS lookup; tests use it to supply a local signing key. */
  keyProvider?: SecretOrKeyProvider<Request>;
  requiredScope?: string;
  tenantId?: string;
}

const challenge = (
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

const MISSING = challenge(
  'access_token_required',
  'Sign in to continue.',
  401,
  false,
);
const INVALID = challenge(
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

const stringClaims = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (claim): claim is string => typeof claim === 'string',
      )
    : [];

/** Stands in for Entra when no tenant/audience is configured. */
class EntraNotConfiguredStrategy extends Strategy {
  name = 'entraUser';

  override authenticate(request: Request): void {
    const challenge = isJwtShaped(bearer(request))
      ? NOT_CONFIGURED
      : MISSING;
    this.fail(challenge, challenge.status);
  }
}

/**
 * Delegated Microsoft Entra users with the management scope and, when configured, the admin
 * app role or one of the admin groups. Only JWT-shaped bearer tokens are considered, so upload
 * tokens fall through to their own strategy.
 */
class EntraUserStrategy extends JwtStrategy {
  constructor(
    options: EntraUserOptions &
      Required<Pick<EntraUserOptions, 'audience' | 'tenantId'>>,
  ) {
    const requiredScope =
      options.requiredScope ?? 'Printers.Manage';
    const restricted =
      Boolean(options.adminRole) ||
      options.adminGroupIds.length > 0;
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
      (claims: Record<string, unknown>, done) => {
        const id =
          typeof claims['oid'] === 'string'
            ? claims['oid']
            : claims['sub'];
        if (typeof id !== 'string' || !id) {
          return done(null, false, INVALID);
        }
        const scopes =
          typeof claims['scp'] === 'string'
            ? claims['scp'].split(/\s+/)
            : [];
        if (!scopes.includes(requiredScope)) {
          return done(
            null,
            false,
            challenge(
              'admin_scope_required',
              'Your sign-in does not allow managing printers.',
              403,
              true,
              {
                scope: requiredScope,
              },
            ),
          );
        }
        const roles = stringClaims(claims['roles']);
        const groups = stringClaims(claims['groups']);
        const isAdmin =
          !restricted ||
          (options.adminRole !== undefined &&
            roles.includes(options.adminRole)) ||
          options.adminGroupIds.some((group) =>
            groups.includes(group),
          );
        if (!isAdmin) {
          return done(
            null,
            false,
            challenge(
              'admin_access_required',
              'You are not a print administrator.',
              403,
              true,
            ),
          );
        }
        done(null, {
          id,
          kind: 'entraUser',
          roles,
        } satisfies Principal);
      },
    );
    this.name = 'entraUser';
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

export function createEntraUserStrategy(
  options: EntraUserOptions,
): Strategy {
  const { audience, tenantId } = options;
  return tenantId && audience
    ? new EntraUserStrategy({ ...options, audience, tenantId })
    : new EntraNotConfiguredStrategy();
}
