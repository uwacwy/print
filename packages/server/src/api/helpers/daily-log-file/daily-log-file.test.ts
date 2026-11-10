import { once } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DailyLogFile, formatLogDate } from './daily-log-file';

describe('DailyLogFile', () => {
  const dirs: string[] = [];
  afterEach(() =>
    dirs
      .splice(0)
      .forEach((dir) =>
        rmSync(dir, { force: true, recursive: true }),
      ),
  );
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'print-daily-'));
    dirs.push(dir);
    return join(dir, 'logs');
  };
  const write = (file: DailyLogFile, text: string) =>
    new Promise<void>((resolve, reject) =>
      file.write(text, (error) =>
        error ? reject(error) : resolve(),
      ),
    );

  it('rolls to a new dated file at midnight, repoints the link, and prunes old files', async () => {
    const dir = tempDir();
    const clock = { now: new Date(2026, 10, 2, 23, 59) };
    const file = new DailyLogFile({
      dir,
      maxDays: 3,
      now: () => clock.now,
      prefix: 'access',
    });
    // Created by an earlier run: one inside the window, two outside, one unrelated.
    for (const name of [
      'access-2026-10-30.log',
      'access-2026-10-31.log',
      'access-2026-11-01.log',
      'other.log',
    ]) {
      writeFileSync(join(dir, name), 'old\n');
    }

    await write(file, 'one\n');
    expect(readlinkSync(join(dir, 'access.log'))).toBe(
      'access-2026-11-02.log',
    );
    expect(readdirSync(dir).sort()).toEqual([
      'access-2026-10-31.log',
      'access-2026-11-01.log',
      'access-2026-11-02.log',
      'access.log',
      'other.log',
    ]);

    clock.now = new Date(2026, 10, 3, 0, 1);
    await write(file, 'two\n');
    file.end();
    await once(file, 'finish');

    expect(
      readFileSync(join(dir, 'access-2026-11-02.log'), 'utf8'),
    ).toBe('one\n');
    expect(readFileSync(join(dir, 'access.log'), 'utf8')).toBe(
      'two\n',
    );
    expect(readlinkSync(join(dir, 'access.log'))).toBe(
      'access-2026-11-03.log',
    );
    expect(existsSync(join(dir, 'access-2026-10-31.log'))).toBe(
      false,
    );
    expect(existsSync(join(dir, 'access-2026-11-01.log'))).toBe(
      true,
    );
    expect(existsSync(join(dir, 'other.log'))).toBe(true);
  });

  it('appends to the existing file after a restart on the same day', async () => {
    const dir = tempDir();
    const now = () => new Date(2026, 10, 2, 12);
    for (const text of ['first\n', 'second\n']) {
      const file = new DailyLogFile({
        dir,
        maxDays: 1,
        now,
        prefix: 'access',
      });
      await write(file, text);
      file.end();
      await once(file, 'finish');
    }
    expect(
      readFileSync(join(dir, 'access-2026-11-02.log'), 'utf8'),
    ).toBe('first\nsecond\n');
  });

  it('formats the local calendar date', () => {
    expect(formatLogDate(new Date(2026, 0, 5, 23, 59))).toBe(
      '2026-01-05',
    );
  });
});
