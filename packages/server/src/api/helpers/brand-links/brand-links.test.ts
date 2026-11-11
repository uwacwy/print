import { describe, expect, it } from 'vitest';

import { parseBrandLinks } from './brand-links';

describe('parseBrandLinks', () => {
  it('pairs labels and urls in order', () => {
    expect(
      parseBrandLinks(
        'label=Privacy+policy&url=https://example.com/privacy&label=Terms&url=/terms',
      ),
    ).toEqual([
      {
        label: 'Privacy policy',
        url: 'https://example.com/privacy',
      },
      { label: 'Terms', url: '/terms' },
    ]);
  });

  it('returns nothing for an empty value', () => {
    expect(parseBrandLinks('')).toEqual([]);
  });

  it('rejects unpaired labels', () => {
    expect(() => parseBrandLinks('label=A')).toThrow(
      /matching url/,
    );
  });

  it.each([
    'javascript:alert(1)',
    '//evil.example',
    'data:text/html,x',
  ])('rejects unsafe url %s', (url) => {
    expect(() => parseBrandLinks(`label=A&url=${url}`)).toThrow(
      /needs a label/,
    );
  });
});
