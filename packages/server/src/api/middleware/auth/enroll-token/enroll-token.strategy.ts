import type { Request } from 'express';

import { Strategy } from 'passport-strategy';

import type { AuthChallenge, Principal } from '../principal';

import {
  type EnrollTokenKey,
  type EnrollTokenVerification,
  verifyEnrollToken,
} from '../../../helpers/enroll-token/enroll-token';
import { bearer } from '../credentials';

const SCHEME = 'Bearer realm="print-enroll"';

export const ENROLL_DENIED: Record<
  | 'required'
  | Exclude<EnrollTokenVerification['status'], 'valid'>,
  Pick<AuthChallenge, 'code' | 'error'>
> = {
  expired: {
    code: 'enroll_token_expired',
    error:
      'This enrollment token has expired. Ask an administrator for a new one.',
  },
  invalid: {
    code: 'enroll_token_invalid',
    error:
      'This enrollment token is not valid. Ask an administrator for a new one.',
  },
  required: {
    code: 'enroll_token_required',
    error: 'An enrollment token is required.',
  },
};

/** Short-lived, multi-use token that lets a print agent create its own printer. */
export class EnrollTokenStrategy extends Strategy {
  name = 'enrollToken';

  constructor(private readonly key: EnrollTokenKey) {
    super();
  }

  override authenticate(request: Request): void {
    const token = bearer(request);
    const verification = token
      ? verifyEnrollToken(this.key, token)
      : undefined;
    if (verification?.status === 'valid') {
      return this.success({
        expiresAt: verification.expiresAt,
        kind: 'enroll',
      } satisfies Principal);
    }
    this.fail(
      {
        ...ENROLL_DENIED[verification?.status ?? 'required'],
        presented: !!token,
        scheme: SCHEME,
        status: 401,
      } satisfies AuthChallenge,
      401,
    );
  }
}
