import { describe, expect, it } from 'vitest';
import { parseVersion, satisfiesMinimum } from './node-version';

describe('node-version', () => {
  it('parses node-style versions', () => {
    expect(parseVersion('v20.17.0')).toEqual([20, 17, 0]);
    expect(parseVersion('24.1.2-nightly')).toEqual([24, 1, 2]);
    expect(parseVersion('twenty')).toBeUndefined();
  });

  it('compares against the minimum', () => {
    expect(satisfiesMinimum('v20.17.0')).toBe(true);
    expect(satisfiesMinimum('v20.19.2')).toBe(true);
    expect(satisfiesMinimum('v24.0.0')).toBe(true);
    expect(satisfiesMinimum('v20.16.9')).toBe(false);
    expect(satisfiesMinimum('v18.20.0')).toBe(false);
    expect(satisfiesMinimum('garbage')).toBe(false);
  });
});
