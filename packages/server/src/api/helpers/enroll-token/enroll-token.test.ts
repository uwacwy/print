import { describe, expect, it } from 'vitest';
import {
  ENROLL_TOKEN_PATTERN,
  signEnrollToken,
  verifyEnrollToken,
} from './enroll-token';

const key = { tokenSecret: 'x'.repeat(40), tokenIssuer: 'test' };
const now = new Date('2025-01-01T12:00:30Z');

describe('enroll tokens', () => {
  it('signs 44-character base64url tokens', () => {
    const { token, notBefore, expiresAt } = signEnrollToken(
      key,
      30,
      now,
    );
    expect(token).toMatch(ENROLL_TOKEN_PATTERN);
    expect(notBefore.toISOString()).toBe('2025-01-01T12:00:00.000Z');
    expect(expiresAt.toISOString()).toBe('2025-01-01T12:30:00.000Z');
  });

  it('makes tokens from the same minute differ', () => {
    expect(signEnrollToken(key, 30, now).token).not.toBe(
      signEnrollToken(key, 30, now).token,
    );
  });

  it('is valid, repeatedly, until it expires', () => {
    const { token } = signEnrollToken(key, 30, now);
    const valid = {
      status: 'valid',
      expiresAt: new Date('2025-01-01T12:30:00Z'),
    };
    expect(verifyEnrollToken(key, token, now)).toEqual(valid);
    expect(verifyEnrollToken(key, token, now)).toEqual(valid);
    expect(
      verifyEnrollToken(
        key,
        token,
        new Date('2025-01-01T12:31:00Z'),
      ),
    ).toEqual({ status: 'expired' });
  });

  it('rejects tampered, foreign-key, and malformed tokens', () => {
    const { token } = signEnrollToken(key, 30, now);
    const flipped = `${token.slice(0, 5)}${token[5] === 'A' ? 'B' : 'A'}${token.slice(6)}`;
    expect(verifyEnrollToken(key, flipped, now).status).toBe(
      'invalid',
    );
    expect(
      verifyEnrollToken(
        { tokenSecret: 'y'.repeat(40), tokenIssuer: 'test' },
        token,
        now,
      ).status,
    ).toBe('invalid');
    expect(verifyEnrollToken(key, 'short', now).status).toBe(
      'invalid',
    );
    expect(verifyEnrollToken(key, 'a'.repeat(43), now).status).toBe(
      'invalid',
    );
  });

  it('rejects tokens from the future', () => {
    const { token } = signEnrollToken(key, 30, now);
    expect(
      verifyEnrollToken(key, token, new Date('2025-01-01T11:50:00Z'))
        .status,
    ).toBe('invalid');
  });

  it('bounds the lifetime', () => {
    expect(() => signEnrollToken(key, 0, now)).toThrow(RangeError);
    expect(() => signEnrollToken(key, 70_000, now)).toThrow(
      RangeError,
    );
  });
});
