import { describe, expect, it } from 'vitest';

import {
  clientId,
  isAppOnlyToken,
  objectId,
  scopeClaims,
  stringClaims,
} from './entra-claims';

describe('entra claims', () => {
  it('keeps only string array entries', () => {
    expect(stringClaims(['a', 1, 'b', null])).toEqual([
      'a',
      'b',
    ]);
    expect(stringClaims('a')).toEqual([]);
  });

  it('splits delegated scopes', () => {
    expect(scopeClaims(' Printers.Manage  User.Read ')).toEqual([
      'Printers.Manage',
      'User.Read',
    ]);
    expect(scopeClaims(undefined)).toEqual([]);
  });

  it('prefers oid over sub and rejects blanks', () => {
    expect(objectId({ oid: 'o', sub: 's' })).toBe('o');
    expect(objectId({ sub: 's' })).toBe('s');
    expect(objectId({ oid: '' })).toBeUndefined();
  });

  it('reads the client from azp (v2) or appid (v1)', () => {
    expect(clientId({ azp: 'v2-client' })).toBe('v2-client');
    expect(clientId({ appid: 'v1-client' })).toBe('v1-client');
    expect(clientId({})).toBeUndefined();
  });

  it('classifies app-only tokens', () => {
    expect(isAppOnlyToken({ roles: ['Printer.Read'] })).toBe(
      true,
    );
    expect(isAppOnlyToken({ idtyp: 'app', scp: 'x' })).toBe(
      true,
    );
    expect(isAppOnlyToken({ scp: 'Printers.Manage' })).toBe(
      false,
    );
    expect(isAppOnlyToken({ idtyp: 'user' })).toBe(false);
  });
});
