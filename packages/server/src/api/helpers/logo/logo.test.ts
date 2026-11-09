import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findLogo, logoSrc, pickLogoFile } from './logo';

describe('pickLogoFile', () => {
  it('prefers svg, then png, then jpg', () => {
    expect(pickLogoFile(['logo.jpg', 'logo.png', 'logo.svg'])).toBe(
      'logo.svg',
    );
    expect(pickLogoFile(['logo.jpg', 'logo.png'])).toBe('logo.png');
    expect(pickLogoFile(['main.js', 'logo.jpeg'])).toBe('logo.jpeg');
  });

  it('ignores other files', () => {
    expect(pickLogoFile(['favicon.ico', 'Logo.PNG', 'logo.gif'])).toBe(
      undefined,
    );
  });
});

describe('logoSrc', () => {
  it('versions the URL by modification time', () => {
    expect(logoSrc('logo.png', 1_700_000_000_123.5)).toBe(
      `/logo.png?v=${(1_700_000_000_123).toString(36)}`,
    );
  });
});

describe('findLogo', () => {
  const dirs: string[] = [];
  const makeDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'logo-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('describes a logo in the directory', () => {
    const dir = makeDir();
    writeFileSync(join(dir, 'logo.png'), '');
    const modified = new Date('2026-11-01T00:00:00Z');
    utimesSync(join(dir, 'logo.png'), modified, modified);
    expect(findLogo(dir, 'United Way')).toEqual({
      src: logoSrc('logo.png', modified.getTime()),
      alt: 'United Way',
    });
  });

  it('is undefined without a logo or directory', () => {
    expect(findLogo(makeDir(), 'United Way')).toBeUndefined();
    expect(
      findLogo(join(tmpdir(), 'missing-logo-dir'), 'United Way'),
    ).toBeUndefined();
  });
});
