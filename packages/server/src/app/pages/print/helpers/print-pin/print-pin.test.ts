import { describe, expect, it } from 'vitest';

import {
  formatPinInput,
  PIN_MAX_LENGTH,
  PIN_PATTERN,
} from './print-pin';

describe('formatPinInput', () => {
  it('groups digits and drops everything else', () => {
    expect(formatPinInput('1234')).toBe('123-4');
    expect(formatPinInput('123 456-7890')).toBe('123-456-789');
    expect(formatPinInput('abc')).toBe('');
    expect(formatPinInput('')).toBe('');
  });

  it('produces values the pattern and max length accept', () => {
    const pin = formatPinInput('987654321');
    expect(PIN_PATTERN.test(pin)).toBe(true);
    expect(pin).toHaveLength(PIN_MAX_LENGTH);
  });
});
