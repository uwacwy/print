import type { Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';

export interface EntraAdminAuthOptions {
  tenantId?: string;
  audience?: string | string[];
  requiredScope?: string;
  adminRole?: string;
  adminGroupIds: string[];
}

export type EntraAccessTokenVerifier = (
  token: string,
  options: { tenantId: string; audience: string | string[] },
) => Promise<JWTPayload>;

const jwksByTenantVersion = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function verifyEntraAccessToken(
  token: string,
  { tenantId, audience }: { tenantId: string; audience: string | string[] },
): Promise<JWTPayload> {
  const tokenVersion = decodeJwt(token)['ver'] === '1.0' ? 'v1' : 'v2';
  const cacheKey = `${tenantId}:${tokenVersion}`;
  let jwks = jwksByTenantVersion.get(cacheKey);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(
        tokenVersion === 'v1'
          ? `https://login.microsoftonline.com/${tenantId}/discovery/keys`
          : `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      ),
    );
    jwksByTenantVersion.set(cacheKey, jwks);
  }

  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ['RS256'],
    issuer:
      tokenVersion === 'v1'
        ? `https://sts.windows.net/${tenantId}/`
        : `https://login.microsoftonline.com/${tenantId}/v2.0`,
    audience,
  });
  return payload;
}

function stringClaims(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((claim): claim is string => typeof claim === 'string')
    : [];
}

/** Verifies the bearer token, writing the 401/503 response itself when it cannot. */
async function authenticateBearer(
  request: Request,
  response: Response,
  options: { tenantId?: string; audience?: string | string[] },
  verifyToken: EntraAccessTokenVerifier,
  notConfiguredError: string,
): Promise<JWTPayload | undefined> {
  if (!options.tenantId || !options.audience) {
    response.status(503).json({ error: notConfiguredError });
    return undefined;
  }

  const bearer = /^Bearer\s+([^\s]+)$/i.exec(request.header('authorization') ?? '');
  if (!bearer) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(401).json({ error: 'missing_access_token' });
    return undefined;
  }

  let claims: JWTPayload;
  try {
    claims = await verifyToken(bearer[1], {
      tenantId: options.tenantId,
      audience: options.audience,
    });
  } catch {
    response.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
    response.status(401).json({ error: 'invalid_access_token' });
    return undefined;
  }

  if (!claims.sub) {
    response.status(401).json({ error: 'invalid_access_token' });
    return undefined;
  }
  return claims;
}

export function createAdminAuth(
  options: EntraAdminAuthOptions,
  verifyToken: EntraAccessTokenVerifier = verifyEntraAccessToken,
): RequestHandler {
  return async (request, response, next) => {
    const claims = await authenticateBearer(
      request,
      response,
      options,
      verifyToken,
      'admin_auth_not_configured',
    );
    if (!claims) return;

    const requiredScope = options.requiredScope ?? 'Printers.Manage';
    const scopes =
      typeof claims['scp'] === 'string' ? claims['scp'].split(/\s+/).filter(Boolean) : [];
    if (!scopes.includes(requiredScope)) {
      response.status(403).json({ error: 'admin_scope_required', scope: requiredScope });
      return;
    }

    const roles = stringClaims(claims['roles']);
    const groups = stringClaims(claims['groups']);
    const hasAdditionalAdminRestrictions =
      Boolean(options.adminRole) || options.adminGroupIds.length > 0;
    const isAdmin =
      !hasAdditionalAdminRestrictions ||
      (options.adminRole !== undefined && roles.includes(options.adminRole)) ||
      options.adminGroupIds.some((groupId) => groups.includes(groupId));

    if (!isAdmin) {
      response.status(403).json({ error: 'admin_access_required' });
      return;
    }

    response.locals['entraAdmin'] = { id: claims.sub, roles };
    next();
  };
}
