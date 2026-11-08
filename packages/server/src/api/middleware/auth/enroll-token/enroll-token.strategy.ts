import type { Request } from 'express';
import { Strategy } from 'passport-strategy';
import {
  verifyEnrollToken,
  type EnrollTokenKey,
  type EnrollTokenVerification,
} from '../../../helpers/enroll-token/enroll-token';
import { bearer } from '../credentials';
import type { AuthChallenge, Principal } from '../principal';

const SCHEME = 'Bearer realm="print-enroll"';

export const ENROLL_DENIED: Record<
  Exclude<EnrollTokenVerification['status'], 'valid'> | 'required',
  Pick<AuthChallenge, 'code' | 'error'>
> = {
  required: {
    code: 'enroll_token_required',
    error: 'An enrollment token is required.',
  },
  invalid: {
    code: 'enroll_token_invalid',
    error:
      'This enrollment token is not valid. Ask an administrator for a new one.',
  },
  expired: {
    code: 'enroll_token_expired',
    error:
      'This enrollment token has expired. Ask an administrator for a new one.',
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
        kind: 'enroll',
        expiresAt: verification.expiresAt,
      } satisfies Principal);
    }
    this.fail(
      {
        ...ENROLL_DENIED[verification?.status ?? 'required'],
        status: 401,
        presented: !!token,
        scheme: SCHEME,
      } satisfies AuthChallenge,
      401,
    );
  }
}
