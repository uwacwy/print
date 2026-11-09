import { describe, expect, it } from 'vitest';
import { apiErrorMessage, DEFAULT_API_ERROR } from './api-error';

describe('apiErrorMessage', () => {
  it('reads the server message', () => {
    expect(apiErrorMessage({ error: { error: 'Slug taken' } })).toBe(
      'Slug taken',
    );
  });

  it('reads the server message wrapped in a cause', () => {
    expect(
      apiErrorMessage(
        new Error('wrapped', { cause: { error: { error: 'Nope' } } }),
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
