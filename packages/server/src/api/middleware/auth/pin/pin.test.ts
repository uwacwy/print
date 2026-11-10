import { describe, expect, it } from 'vitest';

import { formatPin, generatePin, pinMatches } from './pin';

describe('upload PINs', () => {
  it('generates nine-digit PINs and formats them in groups of three', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePin()).toMatch(/^\d{9}$/);
    }
    expect(formatPin('012345678')).toBe('012-345-678');
  });

  it('matches the PIN with or without separators', () => {
    const printer = { pin: '012345678' };
    expect(pinMatches(printer, '012-345-678')).toBe(true);
    expect(pinMatches(printer, ' 012 345 678 ')).toBe(true);
    expect(pinMatches(printer, '012345679')).toBe(false);
    expect(pinMatches(printer, '12345678')).toBe(false);
    expect(pinMatches(printer, 12345678)).toBe(false);
    expect(pinMatches({ pin: null }, '012345678')).toBe(false);
  });
});
