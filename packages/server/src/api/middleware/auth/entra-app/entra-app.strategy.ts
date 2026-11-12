import type { Strategy } from 'passport-strategy';

import {
  createEntraStrategy,
  type EntraOptions,
} from '../entra/entra';
import { isAuthChallenge } from '../principal';
import {
  type EntraAppRole,
  evaluateAppClaims,
} from './entra-app';

export const entraAppStrategyName = (role: EntraAppRole) =>
  `entraApp:${role}` as const;

/**
 * Applications calling with client-credentials tokens from the tenant, authorized by one app
 * role (application permission) granted through admin consent in Entra.
 */
export const createEntraAppStrategy = (
  options: EntraOptions,
  role: EntraAppRole,
): Strategy =>
  createEntraStrategy(
    entraAppStrategyName(role),
    options,
    (claims, done) => {
      const result = evaluateAppClaims(claims, role);
      return isAuthChallenge(result)
        ? done(null, false, result)
        : done(null, result);
    },
  );
