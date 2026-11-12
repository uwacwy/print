import type { AuthChallenge, Principal } from '../principal';

import {
  clientId,
  isAppOnlyToken,
  objectId,
  stringClaims,
} from '../entra-claims/entra-claims';
import { challenge, INVALID } from '../entra/entra';

/** Application permissions (app roles) that client-credentials callers can be granted. */
export const ENTRA_APP_ROLES = [
  'Printer.ManagePin',
  'Printer.PrintFlyer',
  'Printer.PrintJob',
  'Printer.Read',
] as const;

export type EntraAppRole = (typeof ENTRA_APP_ROLES)[number];

/** Delegated (user) tokens are left to `entraUser`, whose failure then explains the rejection. */
const USER_TOKEN = challenge(
  'app_token_required',
  'This endpoint expects an application token.',
  403,
  false,
);

/** Authorizes an app-only token's claims for one app role. */
export function evaluateAppClaims(
  claims: Record<string, unknown>,
  role: EntraAppRole,
): AuthChallenge | Extract<Principal, { kind: 'entraApp' }> {
  if (!isAppOnlyToken(claims)) {
    return USER_TOKEN;
  }
  const id = objectId(claims);
  const client = clientId(claims);
  if (!id || !client) {
    return INVALID;
  }
  const roles = stringClaims(claims['roles']);
  if (!roles.includes(role)) {
    return challenge(
      'app_role_required',
      'This application has not been granted the required permission.',
      403,
      true,
      { role },
    );
  }
  return { clientId: client, id, kind: 'entraApp', roles };
}
