import { describe, expect, it } from 'vitest';

import { parseSiteLinks } from './site-links';

describe('parseSiteLinks', () => {
  it('pairs labels and urls in order', () => {
    expect(
      parseSiteLinks(
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
    expect(parseSiteLinks('')).toEqual([]);
  });

  it('rejects unpaired labels', () => {
    expect(() => parseSiteLinks('label=A')).toThrow(
      /matching url/,
    );
  });

  it.each([
    'javascript:alert(1)',
    '//evil.example',
    'data:text/html,x',
  ])('rejects unsafe url %s', (url) => {
    expect(() => parseSiteLinks(`label=A&url=${url}`)).toThrow(
      /needs a label/,
    );
  });
});
