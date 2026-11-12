export const stringClaims = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (claim): claim is string => typeof claim === 'string',
      )
    : [];

/** Space-delimited delegated scopes (`scp`). */
export const scopeClaims = (value: unknown): string[] =>
  typeof value === 'string'
    ? value.split(/\s+/).filter(Boolean)
    : [];

/** The token's subject: the user's or service principal's object ID. */
export const objectId = (
  claims: Record<string, unknown>,
): string | undefined => {
  const id =
    typeof claims['oid'] === 'string'
      ? claims['oid']
      : claims['sub'];
  return typeof id === 'string' && id ? id : undefined;
};

/** The calling application: `azp` in v2 tokens, `appid` in v1. */
export const clientId = (
  claims: Record<string, unknown>,
): string | undefined => {
  const id = claims['azp'] ?? claims['appid'];
  return typeof id === 'string' && id ? id : undefined;
};

/**
 * Client-credentials (app-only) tokens carry no `scp`; `idtyp` is authoritative when that
 * optional claim is configured.
 */
export const isAppOnlyToken = (
  claims: Record<string, unknown>,
): boolean =>
  claims['idtyp'] === 'app' ||
  (claims['idtyp'] !== 'user' &&
    typeof claims['scp'] !== 'string');
