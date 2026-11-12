import type { Strategy } from 'passport-strategy';

import type { Principal } from '../principal';

import {
  isAppOnlyToken,
  objectId,
  scopeClaims,
  stringClaims,
} from '../entra-claims/entra-claims';
import {
  challenge,
  createEntraStrategy,
  type EntraOptions,
  INVALID,
} from '../entra/entra';

export interface EntraUserOptions extends EntraOptions {
  adminGroupIds: string[];
  adminRole?: string;
  requiredScope?: string;
}

const APP_TOKEN = challenge(
  'app_token_not_allowed',
  'Applications cannot use this endpoint; sign in as a print administrator.',
  403,
  false,
);

/**
 * Delegated Microsoft Entra users with the management scope and, when configured, the admin
 * app role or one of the admin groups. App-only tokens are declined so `entraApp` can explain
 * them on routes that accept applications.
 */
export function createEntraUserStrategy(
  options: EntraUserOptions,
): Strategy {
  const requiredScope =
    options.requiredScope ?? 'Printers.Manage';
  const restricted =
    Boolean(options.adminRole) ||
    options.adminGroupIds.length > 0;
  return createEntraStrategy(
    'entraUser',
    options,
    (claims, done) => {
      if (isAppOnlyToken(claims)) {
        return done(null, false, APP_TOKEN);
      }
      const id = objectId(claims);
      if (!id) {
        return done(null, false, INVALID);
      }
      if (!scopeClaims(claims['scp']).includes(requiredScope)) {
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
}
