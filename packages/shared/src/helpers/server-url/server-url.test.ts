import { describe, expect, it } from 'vitest';
import { isAllowedServerUrl, serverOrigin } from './server-url';

describe('isAllowedServerUrl', () => {
  it('allows https anywhere', () => {
    expect(isAllowedServerUrl('https://print.example.org')).toBe(
      true,
    );
  });

  it('allows http only on loopback', () => {
    expect(isAllowedServerUrl('http://localhost:4200')).toBe(true);
    expect(isAllowedServerUrl('http://127.0.0.2')).toBe(true);
    expect(isAllowedServerUrl('http://[::1]:8080')).toBe(true);
    expect(isAllowedServerUrl('http://print.example.org')).toBe(
      false,
    );
  });

  it('allows any http with insecure', () => {
    expect(
      isAllowedServerUrl('http://print.lan', { insecure: true }),
    ).toBe(true);
  });

  it('rejects other schemes and garbage', () => {
    expect(isAllowedServerUrl('ftp://x')).toBe(false);
    expect(isAllowedServerUrl('not a url')).toBe(false);
  });
});

describe('serverOrigin', () => {
  it('reduces PUBLIC_URL to its origin', () => {
    expect(serverOrigin('https://print.example.org/app/')).toBe(
      'https://print.example.org',
    );
  });

  it('is undefined when unset or not allowed', () => {
    expect(serverOrigin(undefined)).toBeUndefined();
    expect(serverOrigin('')).toBeUndefined();
    expect(serverOrigin('http://print.example.org')).toBeUndefined();
  });
});
