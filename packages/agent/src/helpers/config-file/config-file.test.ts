import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configExists,
  firstWritable,
  loadConfigFile,
  locateConfig,
  readConfig,
  writeConfig,
} from './config-file';

const config = {
  PRINT_SERVER_URL: 'https://print.example.org',
  PRINT_AGENT_TOKEN: 'a'.repeat(43),
  PRINTER_URI: 'cups://Front_Desk',
};

describe('config-file', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-config-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('locates the first existing candidate', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map((name) =>
      join(dir, name, 'x.env'),
    );
    writeFileSync(join(dir, 'b.env'), '');
    expect(
      await locateConfig([a!, join(dir, 'b.env'), b!, c!]),
    ).toBe(join(dir, 'b.env'));
    expect(await locateConfig([a!, c!])).toBeUndefined();
  });

  it('writes atomically with private permissions and reads it back', async () => {
    const path = join(dir, 'nested', 'uwacwy-print-agent.env');
    expect(await configExists(path)).toBe(false);
    await writeConfig(path, config, { mode: 0o600 });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'nested')).mode & 0o777).toBe(0o700);
    expect(readFileSync(path, 'utf8')).toContain(
      "PRINTER_URI='cups://Front_Desk'",
    );
    expect(await readConfig(path)).toEqual({
      path,
      values: config,
      warning: undefined,
    });

    writeFileSync(path, 'PRINTER_URI=cups://Other\n');
    chmodSync(path, 0o644);
    const loose = await readConfig(path);
    expect(loose.values).toEqual({ PRINTER_URI: 'cups://Other' });
    expect(loose.warning).toContain('readable by other users');

    await writeConfig(path, config, { mode: 0o600, preserve: true });
    expect(statSync(path).mode & 0o777).toBe(0o644);
    await writeConfig(path, config, { mode: 0o600 });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('loads --config strictly, otherwise the first candidate', async () => {
    const path = join(dir, 'x.env');
    await expect(loadConfigFile(path, [])).rejects.toMatchObject({
      exitCode: 2,
      message: `Config file ${path} does not exist.`,
    });
    expect(await loadConfigFile(undefined, [path])).toBeUndefined();
    writeFileSync(path, 'PRINTER_URI=cups://Q\n');
    expect(
      (await loadConfigFile(undefined, [path]))?.values,
    ).toEqual({
      PRINTER_URI: 'cups://Q',
    });
    expect((await loadConfigFile(path, []))?.path).toBe(path);
  });

  it('falls through to the first writable location', async () => {
    const writable = join(dir, 'ok', 'x.env');
    expect(await firstWritable('/proc/nope/x.env', [writable])).toBe(
      writable,
    );
    expect(await firstWritable(writable, ['/proc/nope/x.env'])).toBe(
      writable,
    );
    expect(
      await firstWritable('/proc/nope/x.env', []),
    ).toBeUndefined();
  });
});
