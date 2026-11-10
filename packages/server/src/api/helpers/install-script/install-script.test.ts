import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  renderErrorScript,
  renderInstallScript,
} from './install-script';

const syntaxCheck = (script: string) =>
  spawnSync('bash', ['-n'], { encoding: 'utf8', input: script });

const hasShellcheck =
  spawnSync('shellcheck', ['--version']).status === 0;

const enrollScript = renderInstallScript({
  agentVersion: '1.2.3',
  enrollToken: 'A'.repeat(44),
  enrollTokenExpiresAt: new Date('2025-01-01T12:30:00Z'),
  serverUrl: 'https://print.example.org',
});

describe('renderInstallScript', () => {
  it('presets the server, token, and pinned version', () => {
    expect(
      enrollScript.startsWith('#!/usr/bin/env bash\n'),
    ).toBe(true);
    expect(enrollScript).toContain(
      "PRINT_SERVER_URL='https://print.example.org'",
    );
    expect(enrollScript).toContain(
      `PRINT_ENROLL_TOKEN='${'A'.repeat(44)}'`,
    );
    expect(enrollScript).toContain(
      "TOKEN_EXPIRES_AT='2025-01-01T12:30:00.000Z'",
    );
    expect(enrollScript).toContain(
      'AGENT_PACKAGE="${AGENT_PACKAGE:-@uwacwy/print-agent}"',
    );
    expect(enrollScript).toContain(
      'AGENT_VERSION="${AGENT_VERSION:-1.2.3}"',
    );
    expect(enrollScript.trimEnd().endsWith('main "$@"')).toBe(
      true,
    );
  });

  it('never embeds an unsafe version', () => {
    expect(
      renderInstallScript({
        agentVersion: '1"; rm -rf /',
        serverUrl: 'https://x',
      }),
    ).toContain('AGENT_VERSION="${AGENT_VERSION:-}"');
  });

  it('is valid bash', () => {
    expect(syntaxCheck(enrollScript).stderr).toBe('');
    expect(
      syntaxCheck(
        renderInstallScript({ serverUrl: 'https://x' }),
      ).status,
    ).toBe(0);
  });

  it.skipIf(!hasShellcheck)('passes shellcheck', () => {
    const result = spawnSync('shellcheck', ['-'], {
      encoding: 'utf8',
      input: enrollScript,
    });
    expect(result.stdout).toBe('');
  });
});

describe('renderErrorScript', () => {
  it('prints the message and fails', () => {
    const result = spawnSync('bash', [], {
      encoding: 'utf8',
      input: renderErrorScript(`it's "expired" $(nope)`),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      `uwacwy-print-agent: it's "expired" $(nope)\n`,
    );
  });
});

describe('install script run', () => {
  let home: string;

  afterEach(() => rm(home, { force: true, recursive: true }));

  /** A HOME with stand-in node and npm in ~/.local/bin that record how they were called. */
  const fakeHome = async () => {
    home = await mkdtemp(join(tmpdir(), 'install-script-'));
    const bin = join(home, '.local/bin');
    await mkdir(bin, { recursive: true });
    await writeFile(
      join(bin, 'node'),
      [
        '#!/bin/sh',
        'case "$1" in',
        '  -p) echo 22.1.0 ;;',
        '  --version) echo v22.1.0 ;;',
        '  *) printf "%s\\n" "$@" > "$HOME/agent-args" ;;',
        'esac',
      ].join('\n'),
    );
    await writeFile(
      join(bin, 'npm'),
      [
        '#!/bin/sh',
        'prefix=""; for a in "$@"; do',
        '  [ "$last" = --prefix ] && prefix="$a"; last="$a"',
        'done',
        'printf "%s\\n" "$last" > "$HOME/npm-spec"',
        'mkdir -p "$prefix/lib/node_modules/@uwacwy/print-agent/dist"',
        'touch "$prefix/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs"',
      ].join('\n'),
    );
    await chmod(join(bin, 'node'), 0o755);
    await chmod(join(bin, 'npm'), 0o755);
    return bin;
  };

  const run = (
    bin: string,
    script: string,
    args: string[] = [],
  ) =>
    spawnSync('bash', ['-s', '--', ...args], {
      encoding: 'utf8',
      env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` },
      input: script,
    });

  it.skipIf(process.getuid?.() === 0)(
    'installs the pinned agent and hands over to `install`',
    async () => {
      const bin = await fakeHome();
      const result = run(bin, enrollScript, [
        '--slug',
        'front desk',
      ]);
      expect(result.stderr).toContain('Using Node.js v22.1.0');
      expect(result.status).toBe(0);
      expect(
        await readFile(join(home, 'npm-spec'), 'utf8'),
      ).toBe('@uwacwy/print-agent@1.2.3\n');
      expect(
        (await readFile(join(home, 'agent-args'), 'utf8')).split(
          '\n',
        ),
      ).toEqual([
        join(
          home,
          '.local/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs',
        ),
        'install',
        '--print-server-url',
        'https://print.example.org',
        '--print-enroll-token',
        'A'.repeat(44),
        '--slug',
        'front desk',
        '',
      ]);
    },
  );

  it.skipIf(process.getuid?.() === 0)(
    'takes a local package from its own arguments',
    async () => {
      const bin = await fakeHome();
      const result = run(
        bin,
        renderInstallScript({
          serverUrl: 'https://print.example.org',
        }),
        [
          '--agent-package',
          '/tmp/agent.tgz',
          '--print-agent-token',
          'tok',
        ],
      );
      expect(result.status).toBe(0);
      expect(
        await readFile(join(home, 'npm-spec'), 'utf8'),
      ).toBe('/tmp/agent.tgz\n');
      expect(
        (await readFile(join(home, 'agent-args'), 'utf8')).split(
          '\n',
        ),
      ).toEqual([
        expect.stringMatching(/cli\.mjs$/),
        'install',
        '--print-server-url',
        'https://print.example.org',
        '--print-agent-token',
        'tok',
        '',
      ]);
    },
  );
});
