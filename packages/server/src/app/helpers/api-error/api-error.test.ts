import { describe, expect, it } from 'vitest';

import {
  apiErrorCode,
  apiErrorMessage,
  DEFAULT_API_ERROR,
  httpStatus,
} from './api-error';

describe('apiErrorMessage', () => {
  it('reads the server message', () => {
    expect(
      apiErrorMessage({ error: { error: 'Slug taken' } }),
    ).toBe('Slug taken');
  });

  it('reads the server message wrapped in a cause', () => {
    expect(
      apiErrorMessage(
        new Error('wrapped', {
          cause: { error: { error: 'Nope' } },
        }),
      ),
    ).toBe('Nope');
  });

  it.each([null, 'text', {}, { error: 'text' }, { error: {} }])(
    'falls back for %j',
    (error) => {
      expect(apiErrorMessage(error)).toBe(DEFAULT_API_ERROR);
    },
  );

  it('uses a custom fallback', () => {
    expect(apiErrorMessage(null, 'Custom')).toBe('Custom');
  });
});

describe('apiErrorCode', () => {
  it('reads the code, also when wrapped in a cause', () => {
    expect(
      apiErrorCode({ error: { code: 'token_expired' } }),
    ).toBe('token_expired');
    expect(
      apiErrorCode(
        new Error('x', {
          cause: { error: { code: 'token_bad' } },
        }),
      ),
    ).toBe('token_bad');
  });

  it.each([
    null,
    'text',
    {},
    { error: {} },
    { error: { code: 4 } },
  ])('is undefined for %j', (error) => {
    expect(apiErrorCode(error)).toBeUndefined();
  });
});

describe('httpStatus', () => {
  it('reads the status, also when wrapped in a cause', () => {
    expect(httpStatus({ status: 404 })).toBe(404);
    expect(
      httpStatus(new Error('x', { cause: { status: 500 } })),
    ).toBe(500);
  });

  it.each([null, 'text', {}, { status: '404' }])(
    'is undefined for %j',
    (error) => {
      expect(httpStatus(error)).toBeUndefined();
    },
  );
});
