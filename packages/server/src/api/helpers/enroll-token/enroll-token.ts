import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Same secret and issuer as upload tokens; a separate HKDF `info` keeps the MACs independent. */
export interface EnrollTokenKey {
  tokenSecret: string;
  tokenIssuer: string;
}

/**
 * Enrollment tokens let a print agent create its own printer. They are stateless and multi-use
 * until they expire; rotating UPLOAD_TOKEN_SECRET revokes them all. 33 bytes, 44 base64url
 * characters (upload tokens are 42, agent tokens 43, so the shapes never collide):
 *
 *   [0]      version (high nibble) | kind (low nibble, 2 = enroll)
 *   [1..8]   random nonce, so tokens minted in the same minute differ
 *   [9..12]  not-before, minutes since the Unix epoch, uint32 BE
 *   [13..14] lifetime in minutes, uint16 BE
 *   [15..32] HMAC-SHA256(bytes 0..14) truncated to 144 bits
 */
const VERSION = 1;
const KIND = 2;
const HEADER = (VERSION << 4) | KIND;
const BODY_LENGTH = 15;
const TAG_LENGTH = 18;
const TOKEN_LENGTH = BODY_LENGTH + TAG_LENGTH;
const MINUTE_MS = 60_000;
const CLOCK_TOLERANCE_MS = 30_000;
export const MAX_ENROLL_TOKEN_MINUTES = 0xffff;

/** Shape check before a token is embedded in a script or examined further. */
export const ENROLL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{44}$/;

export interface EnrollToken {
  token: string;
  notBefore: Date;
  expiresAt: Date;
}

export type EnrollTokenVerification =
  | { status: 'valid'; expiresAt: Date }
  | { status: 'invalid' | 'expired' };

const macKeys = new WeakMap<EnrollTokenKey, Buffer>();
const macKey = (key: EnrollTokenKey): Buffer => {
  const cached = macKeys.get(key);
  if (cached) {
    return cached;
  }
  const derived = Buffer.from(
    hkdfSync(
      'sha256',
      key.tokenSecret,
      key.tokenIssuer,
      'uwacwy-print enroll-token v1',
      32,
    ),
  );
  macKeys.set(key, derived);
  return derived;
};

const tag = (key: EnrollTokenKey, body: Buffer): Buffer =>
  createHmac('sha256', macKey(key))
    .update(body)
    .digest()
    .subarray(0, TAG_LENGTH);

export function signEnrollToken(
  key: EnrollTokenKey,
  lifetimeMinutes: number,
  now = new Date(),
  nonce: Buffer = randomBytes(8),
): EnrollToken {
  if (
    !Number.isInteger(lifetimeMinutes) ||
    lifetimeMinutes < 1 ||
    lifetimeMinutes > MAX_ENROLL_TOKEN_MINUTES
  ) {
    throw new RangeError(
      `Enrollment tokens last 1 to ${MAX_ENROLL_TOKEN_MINUTES} minutes.`,
    );
  }
  const startMinute = Math.floor(now.getTime() / MINUTE_MS);
  const body = Buffer.alloc(BODY_LENGTH);
  body.writeUInt8(HEADER, 0);
  nonce.copy(body, 1, 0, 8);
  body.writeUInt32BE(startMinute, 9);
  body.writeUInt16BE(lifetimeMinutes, 13);
  return {
    token: Buffer.concat([body, tag(key, body)]).toString(
      'base64url',
    ),
    notBefore: new Date(startMinute * MINUTE_MS),
    expiresAt: new Date((startMinute + lifetimeMinutes) * MINUTE_MS),
  };
}

/** Checks shape, MAC, and time window. */
export function verifyEnrollToken(
  key: EnrollTokenKey,
  token: string,
  now = new Date(),
): EnrollTokenVerification {
  if (!ENROLL_TOKEN_PATTERN.test(token)) {
    return { status: 'invalid' };
  }
  const bytes = Buffer.from(token, 'base64url');
  const body = bytes.subarray(0, BODY_LENGTH);
  if (
    bytes.length !== TOKEN_LENGTH ||
    !timingSafeEqual(bytes.subarray(BODY_LENGTH), tag(key, body)) ||
    body.readUInt8(0) !== HEADER
  ) {
    return { status: 'invalid' };
  }
  const startMinute = body.readUInt32BE(9);
  const notBefore = startMinute * MINUTE_MS;
  const expiresAt =
    (startMinute + body.readUInt16BE(13)) * MINUTE_MS;
  if (now.getTime() + CLOCK_TOLERANCE_MS < notBefore) {
    return { status: 'invalid' };
  }
  return now.getTime() - CLOCK_TOLERANCE_MS >= expiresAt
    ? { status: 'expired' }
    : { status: 'valid', expiresAt: new Date(expiresAt) };
}
