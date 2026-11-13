import {
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findLogoUrl,
  logoUrl,
  pickLogoFile,
  siteLogo,
} from './logo';

describe('pickLogoFile', () => {
  it('prefers svg, then png, then jpg', () => {
    expect(
      pickLogoFile(['logo.jpg', 'logo.png', 'logo.svg']),
    ).toBe('logo.svg');
    expect(pickLogoFile(['logo.jpg', 'logo.png'])).toBe(
      'logo.png',
    );
    expect(pickLogoFile(['main.js', 'logo.jpeg'])).toBe(
      'logo.jpeg',
    );
  });

  it('ignores other files', () => {
    expect(
      pickLogoFile(['favicon.ico', 'Logo.PNG', 'logo.gif']),
    ).toBe(undefined);
  });
});

describe('logoUrl', () => {
  it('versions the URL by modification time', () => {
    expect(logoUrl('logo.png', 1_700_000_000_123.5)).toBe(
      `/logo.png?v=${(1_700_000_000_123).toString(36)}`,
    );
  });
});

describe('findLogoUrl', () => {
  const dirs: string[] = [];
  const makeDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'logo-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('finds a logo in the directory', () => {
    const dir = makeDir();
    writeFileSync(join(dir, 'logo.png'), '');
    const modified = new Date('2026-11-01T00:00:00Z');
    utimesSync(join(dir, 'logo.png'), modified, modified);
    expect(findLogoUrl([dir])).toBe(
      logoUrl('logo.png', modified.getTime()),
    );
  });

  it('prefers the first directory that has a logo', () => {
    const first = makeDir();
    const second = makeDir();
    writeFileSync(join(second, 'logo.svg'), '');
    expect(findLogoUrl([first, second])).toMatch(
      /^\/logo\.svg\?v=/,
    );
    writeFileSync(join(first, 'logo.png'), '');
    expect(findLogoUrl([first, second])).toMatch(
      /^\/logo\.png\?v=/,
    );
  });

  it('is undefined without a logo or directory', () => {
    expect(findLogoUrl([makeDir()])).toBeUndefined();
    expect(
      findLogoUrl([join(tmpdir(), 'missing-logo-dir')]),
    ).toBeUndefined();
  });
});

describe('siteLogo', () => {
  it('describes a logo only when there is one', () => {
    expect(siteLogo('/logo.svg', 'Contoso')).toEqual({
      alt: 'Contoso',
      url: '/logo.svg',
    });
    expect(siteLogo(undefined, 'Contoso')).toBeUndefined();
  });
});
