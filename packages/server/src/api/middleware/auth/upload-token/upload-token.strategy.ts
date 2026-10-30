import type { Request } from 'express';
import { Strategy } from 'passport-strategy';
import type { PrinterRow } from '../../../helpers/database/database.js';
import {
  verifyUploadToken,
  type UploadTokenKey,
  type UploadTokenVerification,
} from './upload-token';
import { bearer, isJwtShaped } from '../credentials';
import {
  routePrinter,
  type AuthChallenge,
  type Principal,
} from '../principal';

const SCHEME = 'Bearer realm="print-upload"';

/**
 * The request's upload token: any bearer that is not a JWT, so Entra access tokens are left to
 * the Entra strategy while mistyped upload tokens still report token_invalid.
 */
export const uploadBearer = (request: Request) => {
  const token = bearer(request);
  return isJwtShaped(token) ? undefined : token;
};

/** Status of the request's upload token for this printer, or null when none was sent. */
export async function uploadTokenStatus(
  key: UploadTokenKey,
  printer: PrinterRow,
  request: Request,
): Promise<UploadTokenVerification | null> {
  const token = uploadBearer(request);
  return token ? verifyUploadToken(key, printer, token) : null;
}

const DENIED: Record<
  Exclude<UploadTokenVerification['status'], 'valid'>,
  Pick<AuthChallenge, 'code' | 'error'>
> = {
  invalid: {
    code: 'token_invalid',
    error:
      'This print link is not valid. Scan the QR code again or enter the PIN.',
  },
  expired: {
    code: 'token_expired',
    error:
      'This print link has expired. Scan the QR code again or enter the PIN.',
  },
  'not-yet-valid': {
    code: 'token_not_yet_valid',
    error: 'This QR code is not active yet.',
  },
};

/** QR or PIN-exchanged upload token for the printer named by the route's `:slug`. */
export class UploadTokenStrategy extends Strategy {
  name = 'uploadToken';

  constructor(private readonly key: UploadTokenKey) {
    super();
  }

  override authenticate(request: Request): void {
    const printer = routePrinter(request.res);
    const token = uploadBearer(request);
    if (!printer || !token) {
      return this.fail(
        {
          code: 'token_required',
          error:
            "Scan the printer's QR code or enter its PIN to print.",
          status: 401,
          presented: false,
          scheme: SCHEME,
        } satisfies AuthChallenge,
        401,
      );
    }
    verifyUploadToken(this.key, printer, token).then(
      (verification) => {
        if (verification.status === 'valid') {
          const { source, notBefore, expiresAt } = verification;
          return this.success({
            kind: 'uploadToken',
            printer,
            source,
            notBefore,
            expiresAt,
          } satisfies Principal);
        }
        this.fail(
          {
            ...DENIED[verification.status],
            status: 401,
            presented: true,
            scheme: SCHEME,
          } satisfies AuthChallenge,
          401,
        );
      },
      (error: unknown) => this.error(error as Error),
    );
  }
}
