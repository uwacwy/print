import type { Request } from 'express';
import { Strategy } from 'passport-strategy';
import { pinCredential } fro../../../helpers/database/database.js
import { pinMatches } from './pin';
import {
  routePrinter,
  type AuthChallenge,
  type Principal,
} from '../principal';

const SCHEME = 'Pin realm="print-upload"';

/** `Authorization: Pin 111-222-333` for the printer named by the route's `:slug`. */
export class PinStrategy extends Strategy {
  name = 'pin';

  override authenticate(request: Request): void {
    const pin = pinCredential(request);
    const printer = routePrinter(request.res);
    const fail = (
      challenge: Omit<AuthChallenge, 'presented' | 'scheme'>,
    ) =>
      this.fail(
        { ...challenge, presented: !!pin, scheme: SCHEME },
        challenge.status,
      );

    if (!pin || !printer) {
      return fail({
        code: 'pin_required',
        error: "Enter the printer's PIN to print.",
        status: 401,
      });
    }
    if (!printer.pin) {
      return fail({
        code: 'pin_disabled',
        error:
          'This printer does not accept a PIN. Scan the QR code posted at the printer.',
        status: 403,
      });
    }
    if (!pinMatches(printer, pin)) {
      return fail({
        code: 'pin_incorrect',
        error: 'That PIN is not correct.',
        status: 401,
      });
    }
    this.success({ kind: 'pin', printer } satisfies Principal);
  }
}
