import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ensurePublicDir } from './public-dir';

describe('ensurePublicDir', () => {
  const dirs: string[] = [];
  const makeDataDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'public-dir-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('creates the directory when missing', () => {
    const dataDir = makeDataDir();
    const dir = ensurePublicDir(dataDir);
    expect(dir).toBe(join(dataDir, 'public'));
    expect(statSync(join(dataDir, 'public')).isDirectory()).toBe(
      true,
    );
  });

  it('uses an existing directory', () => {
    const dataDir = makeDataDir();
    ensurePublicDir(dataDir);
    expect(ensurePublicDir(dataDir)).toBe(
      join(dataDir, 'public'),
    );
  });

  it('leaves a file in the way alone', () => {
    const dataDir = makeDataDir();
    const path = join(dataDir, 'public');
    writeFileSync(path, 'not a directory');
    expect(ensurePublicDir(dataDir)).toBeUndefined();
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).isFile()).toBe(true);
  });
});
