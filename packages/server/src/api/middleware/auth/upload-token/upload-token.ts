import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { PrinterRow } from '../../../helpers/database/database';

/** HKDF salt when no Entra client ID is configured. */
export const DEFAULT_UPLOAD_TOKEN_ISSUER = 'uwacwy-print';
const CLOCK_TOLERANCE_MS = 30_000;
const MINUTE_MS = 60_000;

/**
 * Upload tokens end up in QR codes, so every byte makes the code denser and harder for cheap
 * phone cameras to read. Only this server issues and checks them, so instead of a JWT they are a
 * fixed 31-byte layout authenticated with a truncated HMAC-SHA256 (no encryption: nothing inside
 * is secret, it just must not be forgeable), encoded as 42 base64url characters:
 *
 *   [0]      version (high nibble) | key id (low nibble)
 *   [1]      flags: bit 0 = source (0 qr, 1 pin); other bits must be 0
 *   [2..5]   printer id, uint32 BE
 *   [6..7]   qr epoch, uint16 BE
 *   [8..11]  not-before, minutes since the Unix epoch, uint32 BE
 *   [12..14] lifetime in minutes, uint24 BE
 *   [15..30] HMAC-SHA256(bytes 0..14) truncated to 128 bits
 *
 * The slug is not included: the URL carries it and the printer is matched by id.
 */
const VERSION = 1;
const KEY_ID = 0;
const BODY_LENGTH = 15;
const TAG_LENGTH = 16;
const TOKEN_LENGTH = BODY_LENGTH + TAG_LENGTH;
const MAX_UINT16 = 0xffff;
const MAX_UINT24 = 0xffffff;
const MAX_UINT32 = 0xffffffff;

export type UploadTokenSource = 'qr' | 'pin';
export type UploadTokenPrinter = Pick<PrinterRow, 'id' | 'qr_epoch'>;

/** MAC key material; the issuer (the Entra client ID) scopes tokens to this app. */
export interface UploadTokenKey {
  tokenSecret: string;
  tokenIssuer: string;
}

export interface UploadToken {
  token: string;
  source: UploadTokenSource;
  notBefore: Date;
  expiresAt: Date;
}

/** An authentic token's contents, before checking it against a printer or the clock. */
export interface UploadTokenClaims {
  source: UploadTokenSource;
  printerId: number;
  epoch: number;
  notBefore: Date;
  expiresAt: Date;
}

export interface SignUploadTokenOptions {
  source: UploadTokenSource;
  notBefore: Date;
  expiresAt: Date;
  /** Longest allowed validity window, measured from the later of now and notBefore. */
  maxLifetimeMs: number;
  now?: Date;
}

export type UploadTokenVerification =
  | {
      status: 'valid';
      source: UploadTokenSource;
      notBefore: Date;
      expiresAt: Date;
    }
  | { status: 'invalid' | 'expired' | 'not-yet-valid' };

export class UploadTokenWindowError extends Error {}

const macKeys = new WeakMap<UploadTokenKey, Buffer>();
const macKey = (key: UploadTokenKey) => {
  let derived = macKeys.get(key);
  if (!derived) {
    derived = Buffer.from(
      hkdfSync(
        'sha256',
        key.tokenSecret,
        key.tokenIssuer,
        'uwacwy-print upload-token v1',
        32,
      ),
    );
    macKeys.set(key, derived);
  }
  return derived;
};

const tag = (key: UploadTokenKey, body: Buffer) =>
  createHmac('sha256', macKey(key))
    .update(body)
    .digest()
    .subarray(0, TAG_LENGTH);

// async so window validation errors surface as rejections, which callers rely on.
// eslint-disable-next-line @typescript-eslint/require-await
export async function signUploadToken(
  key: UploadTokenKey,
  printer: UploadTokenPrinter,
  {
    source,
    notBefore,
    expiresAt,
    maxLifetimeMs,
    now = new Date(),
  }: SignUploadTokenOptions,
): Promise<UploadToken> {
  if (
    Number.isNaN(notBefore.getTime()) ||
    Number.isNaN(expiresAt.getTime())
  ) {
    throw new UploadTokenWindowError(
      'Choose a valid start and end time.',
    );
  }
  if (expiresAt <= notBefore) {
    throw new UploadTokenWindowError(
      'The end time must be after the start time.',
    );
  }
  if (expiresAt <= now) {
    throw new UploadTokenWindowError(
      'The end time must be in the future.',
    );
  }
  const start = Math.max(now.getTime(), notBefore.getTime());
  if (expiresAt.getTime() - start > maxLifetimeMs) {
    throw new UploadTokenWindowError(
      `A code can be valid for at most ${Math.max(1, Math.floor(maxLifetimeMs / 86_400_000))} days.`,
    );
  }

  const startMinute = Math.floor(notBefore.getTime() / MINUTE_MS);
  const lifetime =
    Math.ceil(expiresAt.getTime() / MINUTE_MS) - startMinute;
  if (
    startMinute < 0 ||
    startMinute > MAX_UINT32 ||
    lifetime > MAX_UINT24
  ) {
    throw new UploadTokenWindowError(
      'Choose a valid start and end time.',
    );
  }
  if (
    !Number.isInteger(printer.id) ||
    printer.id < 0 ||
    printer.id > MAX_UINT32
  ) {
    throw new RangeError(
      `Printer id ${printer.id} does not fit in an upload token.`,
    );
  }
  if (
    !Number.isInteger(printer.qr_epoch) ||
    printer.qr_epoch < 0 ||
    printer.qr_epoch > MAX_UINT16
  ) {
    throw new RangeError(
      `QR epoch ${printer.qr_epoch} does not fit in an upload token.`,
    );
  }

  const body = Buffer.alloc(BODY_LENGTH);
  body.writeUInt8((VERSION << 4) | KEY_ID, 0);
  body.writeUInt8(source === 'pin' ? 1 : 0, 1);
  body.writeUInt32BE(printer.id, 2);
  body.writeUInt16BE(printer.qr_epoch, 6);
  body.writeUInt32BE(startMinute, 8);
  body.writeUIntBE(lifetime, 12, 3);
  return {
    token: Buffer.concat([body, tag(key, body)]).toString(
      'base64url',
    ),
    source,
    notBefore: new Date(startMinute * MINUTE_MS),
    expiresAt: new Date((startMinute + lifetime) * MINUTE_MS),
  };
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}$/;

/** Checks the format and MAC only; returns undefined for anything not issued by this server. */
export function inspectUploadToken(
  key: UploadTokenKey,
  token: string,
): UploadTokenClaims | undefined {
  if (!TOKEN_PATTERN.test(token)) {
    return undefined;
  }
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== TOKEN_LENGTH) {
    return undefined;
  }
  const body = bytes.subarray(0, BODY_LENGTH);
  if (
    !timingSafeEqual(bytes.subarray(BODY_LENGTH), tag(key, body))
  ) {
    return undefined;
  }
  const header = body.readUInt8(0);
  const flags = body.readUInt8(1);
  if (
    header >> 4 !== VERSION ||
    (header & 0x0f) !== KEY_ID ||
    flags > 1
  ) {
    return undefined;
  }
  const startMinute = body.readUInt32BE(8);
  return {
    source: flags === 1 ? 'pin' : 'qr',
    printerId: body.readUInt32BE(2),
    epoch: body.readUInt16BE(6),
    notBefore: new Date(startMinute * MINUTE_MS),
    expiresAt: new Date(
      (startMinute + body.readUIntBE(12, 3)) * MINUTE_MS,
    ),
  };
}

/** Verifies the MAC, printer binding, revocation epoch, and time window. */
// eslint-disable-next-line @typescript-eslint/require-await -- async to match signUploadToken.
export async function verifyUploadToken(
  key: UploadTokenKey,
  printer: UploadTokenPrinter,
  token: string,
  now = new Date(),
): Promise<UploadTokenVerification> {
  const claims = inspectUploadToken(key, token);
  if (
    !claims ||
    claims.printerId !== printer.id ||
    claims.epoch !== printer.qr_epoch
  ) {
    return { status: 'invalid' };
  }
  if (
    now.getTime() + CLOCK_TOLERANCE_MS <
    claims.notBefore.getTime()
  ) {
    return { status: 'not-yet-valid' };
  }
  if (
    now.getTime() - CLOCK_TOLERANCE_MS >=
    claims.expiresAt.getTime()
  ) {
    return { status: 'expired' };
  }
  return {
    status: 'valid',
    source: claims.source,
    notBefore: claims.notBefore,
    expiresAt: claims.expiresAt,
  };
}
