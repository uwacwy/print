import { describe, expect, it } from 'vitest';
import {
  inspectUploadToken,
  signUploadToken,
  UploadTokenWindowError,
  verifyUploadToken,
} from './upload-token.js';

const secret = 'a-test-secret-that-is-at-least-32-characters';
const clientId = '22222222-2222-4222-8222-222222222222';
const key = { tokenSecret: secret, tokenIssuer: clientId };
const printer = { id: 7, qr_epoch: 0 };
const now = new Date('2026-10-29T12:00:00Z');
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);
const maxLifetimeMs = 365 * 86_400_000;

const sign = (
  overrides: Partial<Parameters<typeof signUploadToken>[2]> = {},
) =>
  signUploadToken(key, printer, {
    source: 'qr',
    notBefore: now,
    expiresAt: hours(24),
    maxLifetimeMs,
    now,
    ...overrides,
  });

const flipByte = (token: string, index: number) => {
  const bytes = Buffer.from(token, 'base64url');
  bytes[index]! ^= 0x01;
  return bytes.toString('base64url');
};

describe('upload tokens', () => {
  it('issues a 42-character token that round-trips', async () => {
    const issued = await sign();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{42}$/);
    expect(inspectUploadToken(key, issued.token)).toEqual({
      source: 'qr',
      printerId: 7,
      epoch: 0,
      notBefore: now,
      expiresAt: hours(24),
    });
    await expect(
      verifyUploadToken(key, printer, issued.token, hours(1)),
    ).resolves.toEqual({
      status: 'valid',
      source: 'qr',
      notBefore: now,
      expiresAt: hours(24),
    });
  });

  it('matches a known-answer vector so the format stays stable', async () => {
    const { token } = await sign({ source: 'pin' });
    expect(
      Buffer.from(token, 'base64url')
        .subarray(0, 15)
        .toString('hex'),
    ).toBe(
      '1001' +
        '00000007' +
        '0000' +
        (now.getTime() / 60_000).toString(16).padStart(8, '0') +
        '0005a0',
    );
    expect(token).toBe((await sign({ source: 'pin' })).token);
  });

  it('rounds the window outward to whole minutes', async () => {
    const issued = await sign({
      notBefore: new Date(now.getTime() + 30_500),
      expiresAt: new Date(hours(1).getTime() + 1_000),
    });
    expect(issued.notBefore).toEqual(now);
    expect(issued.expiresAt).toEqual(
      new Date(hours(1).getTime() + 60_000),
    );
  });

  it('reports expired and not-yet-valid windows with clock tolerance', async () => {
    const issued = await sign({
      notBefore: hours(2),
      expiresAt: hours(4),
    });
    const status = async (at: Date) =>
      (await verifyUploadToken(key, printer, issued.token, at))
        .status;
    expect(await status(now)).toBe('not-yet-valid');
    expect(await status(new Date(hours(2).getTime() - 20_000))).toBe(
      'valid',
    );
    expect(await status(hours(3))).toBe('valid');
    expect(await status(new Date(hours(4).getTime() + 20_000))).toBe(
      'valid',
    );
    expect(await status(hours(5))).toBe('expired');
  });

  it('rejects tokens for another printer, a revoked epoch, or a different key', async () => {
    const { token } = await sign();
    const at = hours(1);
    const status = async (target: typeof printer, verifyKey = key) =>
      (await verifyUploadToken(verifyKey, target, token, at)).status;
    expect(await status({ ...printer, id: 8 })).toBe('invalid');
    expect(await status({ ...printer, qr_epoch: 1 })).toBe(
      'invalid',
    );
    expect(
      await status(printer, {
        ...key,
        tokenSecret: `${secret}-other`,
      }),
    ).toBe('invalid');
    expect(
      await status(printer, { ...key, tokenIssuer: 'another-app' }),
    ).toBe('invalid');
  });

  it('rejects any tampered byte and malformed input', async () => {
    const { token } = await sign();
    for (let index = 0; index < 31; index++) {
      expect(
        inspectUploadToken(key, flipByte(token, index)),
        `byte ${index}`,
      ).toBeUndefined();
    }
    for (const bad of [
      '',
      'not.a.jwt',
      token.slice(1),
      `${token}A`,
      token.replace(/.$/, '='),
    ]) {
      expect(inspectUploadToken(key, bad)).toBeUndefined();
    }
  });

  it('refuses ids and epochs that do not fit', async () => {
    await expect(
      signUploadToken(
        key,
        { id: 7, qr_epoch: 0x10000 },
        {
          source: 'qr',
          notBefore: now,
          expiresAt: hours(1),
          maxLifetimeMs,
          now,
        },
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('validates the requested window', async () => {
    await expect(sign({ expiresAt: now })).rejects.toBeInstanceOf(
      UploadTokenWindowError,
    );
    await expect(
      sign({ notBefore: hours(-5), expiresAt: hours(-1) }),
    ).rejects.toThrow('future');
    await expect(
      sign({ expiresAt: hours(24 * 400) }),
    ).rejects.toThrow('at most 365 days');
    await expect(
      sign({ notBefore: new Date('nope') }),
    ).rejects.toThrow('valid start');
  });
});
