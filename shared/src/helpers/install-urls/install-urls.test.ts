import { describe, expect, it } from 'vitest';
import { installUrl } from './install-urls';

describe('installUrl', () => {
  it('builds the enrollment script URL', () => {
    expect(installUrl('https://print.example.org', 'abc')).toBe(
      'https://print.example.org/printer/abc/install',
    );
  });

  it('builds the generic script URL', () => {
    expect(installUrl('https://print.example.org/')).toBe(
      'https://print.example.org/install.sh',
    );
  });
});
