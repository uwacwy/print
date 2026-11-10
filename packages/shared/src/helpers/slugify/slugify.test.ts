import { describe, expect, it } from 'vitest';
import { PRINTER_SLUG_PATTERN } from '../../index';
import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('HP LaserJet MFP M130fw (D8F5EC)')).toBe(
      'hp-laserjet-mfp-m130fw-d8f5ec',
    );
  });

  it('strips accents and edge separators', () => {
    expect(slugify('  Café — Front Desk!  ')).toBe(
      'cafe-front-desk',
    );
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(62)} b`);
    expect(slug).toBe('a'.repeat(62));
    expect(slug).toMatch(PRINTER_SLUG_PATTERN);
  });

  it('returns an empty string when nothing is usable', () => {
    expect(slugify('!!!')).toBe('');
  });
});
