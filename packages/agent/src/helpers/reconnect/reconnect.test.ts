import { describe, expect, it } from 'vitest';

import {
  connectErrorDetail,
  formatSeconds,
  MAX_RETRY_MS,
  nextRetryDelay,
  toWholeSeconds,
  withJitter,
} from './reconnect';

describe('reconnect timing', () => {
  it('doubles the delay up to the cap', () => {
    expect(nextRetryDelay(1000)).toBe(2000);
    expect(nextRetryDelay(40_000)).toBe(MAX_RETRY_MS);
    expect(nextRetryDelay(MAX_RETRY_MS)).toBe(MAX_RETRY_MS);
  });

  it('adds up to a third of the delay as jitter', () => {
    expect(withJitter(3000, () => 0)).toBe(3000);
    expect(withJitter(3000, () => 0.5)).toBe(3500);
    expect(withJitter(3000, () => 0.999)).toBeLessThan(4000);
  });

  it('rounds to whole seconds, at least 1', () => {
    expect(toWholeSeconds(0)).toBe(1);
    expect(toWholeSeconds(1499)).toBe(1);
    expect(toWholeSeconds(2600)).toBe(3);
  });

  it('pluralizes seconds', () => {
    expect(formatSeconds(1)).toBe('1 second');
    expect(formatSeconds(4)).toBe('4 seconds');
  });
});

describe('connectErrorDetail', () => {
  it('hides generic transport failures', () => {
    expect(
      connectErrorDetail(new Error('websocket error')),
    ).toBe('');
    expect(connectErrorDetail(new Error(''))).toBe('');
  });

  it('shows why a handshake was rejected', () => {
    expect(connectErrorDetail(new Error('Unauthorized'))).toBe(
      ' (Unauthorized)',
    );
  });
});
