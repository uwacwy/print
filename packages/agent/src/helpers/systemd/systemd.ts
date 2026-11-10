import { posix } from 'node:path';

export const SERVICE_NAME = 'uwacwy-print-agent';
export const SERVICE_UNIT = `${SERVICE_NAME}.service`;
/** System account for host-wide installs. */
export const SERVICE_USER = 'uwacwy-print';

export type ServiceScope = 'system' | 'user';

export const serviceScope = (uid: number): ServiceScope =>
  uid === 0 ? 'system' : 'user';

export function unitPath(
  scope: ServiceScope,
  homedir: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (scope === 'system') {
    return posix.join('/etc/systemd/system', SERVICE_UNIT);
  }
  const xdg = env['XDG_CONFIG_HOME'];
  const configDir =
    xdg && posix.isAbsolute(xdg)
      ? xdg
      : posix.join(homedir, '.config');
  return posix.join(configDir, 'systemd/user', SERVICE_UNIT);
}

/** `systemctl` arguments for the scope. */
export const systemctlArgs = (
  scope: ServiceScope,
  ...args: string[]
): string[] => (scope === 'user' ? ['--user', ...args] : args);

/** npx runs packages from a cache that npm may prune, so a service must not point into it. */
export const isEphemeralInstall = (cliPath: string): boolean =>
  cliPath.split(posix.sep).includes('_npx');

/**
 * Prefers the `node` found on PATH (e.g. `~/.local/bin/node`, a symlink) over the versioned
 * directory it resolves to, so upgrading Node in place keeps the unit working.
 */
export const stableNodePath = ({
  execPath,
  execRealpath,
  pathNode,
  pathNodeRealpath,
}: {
  execPath: string;
  execRealpath: string;
  pathNode?: string;
  pathNodeRealpath?: string;
}): string =>
  pathNode && pathNodeRealpath === execRealpath
    ? pathNode
    : execPath;

export interface UnitOptions {
  cliPath: string;
  configPath: string;
  /** Passes `--insecure` to `run` (plain http:// server off localhost). */
  insecure?: boolean;
  nodePath: string;
  scope: ServiceScope;
}

/** One ExecStart word: `%` and `$` are systemd specifiers; quote anything with spaces. */
export function systemdArg(value: string): string {
  const escaped = value
    .replace(/%/g, '%%')
    .replace(/\$/g, '$$$$');
  return /[\s"'\\;]/.test(escaped)
    ? `"${escaped.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : escaped;
}

const underHome = (path: string) =>
  /^\/(home|root)(\/|$)/.test(path);

/** The agent's systemd unit; `run --config` reads the file itself, so no `EnvironmentFile=`. */
export function renderUnit({
  cliPath,
  configPath,
  insecure = false,
  nodePath,
  scope,
}: UnitOptions): string {
  const execStart = [
    nodePath,
    cliPath,
    'run',
    '--config',
    configPath,
    ...(insecure ? ['--insecure'] : []),
  ]
    .map(systemdArg)
    .join(' ');
  const hardening =
    scope === 'system'
      ? [
          `User=${SERVICE_USER}`,
          `Group=${SERVICE_USER}`,
          'NoNewPrivileges=true',
          'PrivateTmp=true',
          'ProtectSystem=strict',
          // Node or the agent installed under a home directory must stay readable.
          `ProtectHome=${[nodePath, cliPath, configPath].some(underHome) ? 'read-only' : 'true'}`,
          'ProtectKernelTunables=true',
          'ProtectKernelModules=true',
          'ProtectControlGroups=true',
          'LockPersonality=true',
          'RestrictSUIDSGID=true',
          'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
        ]
      : ['NoNewPrivileges=true'];
  return [
    '# Written by `uwacwy-print-agent install`.',
    '[Unit]',
    'Description=United Way Quick Print agent',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${execStart}`,
    'Environment=NODE_ENV=production',
    'Restart=always',
    'RestartSec=5',
    ...hardening,
    '',
    '[Install]',
    `WantedBy=${scope === 'system' ? 'multi-user.target' : 'default.target'}`,
    '',
  ].join('\n');
}
