import { describe, expect, it } from 'vitest';
import { inflect } from './inflect.js';

describe('inflect', () => {
  it.each([
    [0, 'printers'],
    [1, 'printer'],
    [2, 'printers'],
  ])('uses the right form for %i', (count, word) => {
    expect(inflect(count, 'printer')).toBe(word);
  });

  it('accepts an irregular plural', () => {
    expect(inflect(3, 'copy', 'copies')).toBe('copies');
    expect(inflect(1, 'copy', 'copies')).toBe('copy');
  });
});
