import { describe, expect, it } from 'vitest';

import { ServerStatus } from './status';

describe('ServerStatus', () => {
  it('accepts a count', () => {
    expect(ServerStatus.parse({ printersOnline: 2 })).toEqual({
      printersOnline: 2,
    });
  });

  it('rejects negative or missing counts', () => {
    expect(
      ServerStatus.safeParse({ printersOnline: -1 }).success,
    ).toBe(false);
    expect(ServerStatus.safeParse({}).success).toBe(false);
  });
});
