import { describe, expect, it } from 'vitest';

import { selectChallenge } from './passport';

describe('selectChallenge', () => {
  const missing = (code: string) => ({
    code,
    error: code,
    presented: false,
    status: 401 as const,
  });
  it('prefers the first presented credential, else the first strategy', () => {
    const presented = {
      code: 'token_expired',
      error: '',
      presented: true,
      status: 401 as const,
    };
    expect(
      selectChallenge([missing('a'), presented, missing('b')]),
    ).toBe(presented);
    expect(
      selectChallenge([missing('a'), missing('b')]).code,
    ).toBe('a');
    expect(selectChallenge([new Error('x')]).code).toBe(
      'unauthorized',
    );
  });
});
