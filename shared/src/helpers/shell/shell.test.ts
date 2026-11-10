import { describe, expect, it } from 'vitest';
import { shArg, shq } from './shell';

describe('shq', () => {
  it('wraps values in single quotes', () => {
    expect(shq('abc')).toBe(`'abc'`);
    expect(shq('')).toBe(`''`);
  });

  it('escapes embedded single quotes', () => {
    expect(shq(`it's`)).toBe(`'it'\\''s'`);
  });

  it('neutralises shell metacharacters', () => {
    expect(shq('$(rm -rf /); `x` "y"')).toBe(
      `'$(rm -rf /); \`x\` "y"'`,
    );
  });
});

describe('shArg', () => {
  it('leaves plain words alone', () => {
    expect(shArg('https://print.example.org')).toBe(
      'https://print.example.org',
    );
    expect(shArg('cups://HP-LaserJet_1')).toBe(
      'cups://HP-LaserJet_1',
    );
  });

  it('quotes anything else', () => {
    expect(shArg('a b')).toBe(`'a b'`);
    expect(shArg('ipp://h/p?x=1&y')).toBe(`'ipp://h/p?x=1&y'`);
  });
});
