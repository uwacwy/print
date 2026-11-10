import type { RequestHandler, Response } from 'express';

import {
  type EnrollTokenKey,
  verifyEnrollToken,
} from '../../../helpers/enroll-token/enroll-token';
import { ENROLL_DENIED } from './enroll-token.strategy';

export interface EnrollTokenDenial {
  code: string;
  error: string;
  status: 401 | 410;
}

/**
 * Verifies the enrollment token in the `:token` path segment (install scripts are fetched with
 * plain `curl`, so there is no Authorization header) and stores its expiry in
 * `response.locals.enrollTokenExpiresAt`; `deny` answers when it is invalid or expired.
 */
export const enrollTokenParam =
  (
    key: EnrollTokenKey,
    deny: (
      response: Response,
      denial: EnrollTokenDenial,
    ) => void,
  ): RequestHandler<{ token: string }> =>
  (request, response, next) => {
    const verification = verifyEnrollToken(
      key,
      request.params.token,
    );
    if (verification.status === 'valid') {
      response.locals['enrollTokenExpiresAt'] =
        verification.expiresAt;
      return next();
    }
    deny(response, {
      status: verification.status === 'expired' ? 410 : 401,
      ...ENROLL_DENIED[verification.status],
    });
  };
