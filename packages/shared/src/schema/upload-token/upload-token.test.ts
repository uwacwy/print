import { describe, expect, it } from 'vitest';

import {
  IssuedQrToken,
  QrPosterRequest,
  UploadTokenWindow,
} from './upload-token';

describe('upload token schemas', () => {
  it('accepts offset datetimes in a window', () => {
    expect(
      UploadTokenWindow.safeParse({
        expiresAt: '2030-01-01T00:00:00-07:00',
      }).success,
    ).toBe(true);
    expect(
      UploadTokenWindow.safeParse({ notBefore: 'tomorrow' })
        .success,
    ).toBe(false);
  });

  it('allows reusing a token but not an empty one', () => {
    expect(
      QrPosterRequest.safeParse({ token: 'abc' }).success,
    ).toBe(true);
    expect(
      QrPosterRequest.safeParse({ token: '' }).success,
    ).toBe(false);
  });

  it('extends an issued token with its link', () => {
    expect(
      IssuedQrToken.safeParse({
        expiresAt: 'a',
        notBefore: 'b',
        path: '/print/x?token=t',
        token: 't',
        url: 'https://s/print/x?token=t',
      }).success,
    ).toBe(true);
  });
});
