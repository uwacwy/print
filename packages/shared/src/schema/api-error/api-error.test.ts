import { describe, expect, it } from 'vitest';

import { ApiError } from './api-error';

describe('ApiError', () => {
  it('accepts a code and per-field issues', () => {
    expect(
      ApiError.parse({
        code: 'invalid_request',
        error: 'Invalid body.',
        issues: {
          errors: [],
          properties: { queue: { errors: ['Required'] } },
        },
      }),
    ).toMatchObject({ code: 'invalid_request' });
  });

  it('requires the message', () => {
    expect(ApiError.safeParse({ code: 'x' }).success).toBe(
      false,
    );
  });
});
