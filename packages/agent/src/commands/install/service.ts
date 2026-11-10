import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { CliError } from '../../helpers/cli-error/cli-error';
import {
  isEphemeralInstall,
  renderUnit,
  SERVICE_NAME,
  SERVICE_UNIT,
  SERVICE_USER,
  type ServiceScope,
  stableNodePath,
  systemctlArgs,
  unitPath,
} from '../../helpers/systemd/systemd';
import { AGENT_VERSION } from '../../version';

const execFileAsync = promisify(execFile);
const PACKAGE = '@uwacwy/print-agent';

const exec = async (
  file: string,
  args: string[],
): Promise<string> =>
  (
    await execFileAsync(file, args, { encoding: 'utf8' })
  ).stdout.trim();

const succeeds = (
  file: string,
  args: string[],
): Promise<boolean> =>
  exec(file, args).then(
    () => true,
    () => false,
  );

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/** systemd is running and, for a user service, the user's manager is reachable. */
export const systemdAvailable = (
  scope: ServiceScope,
): Promise<boolean> =>
  succeeds(
    'systemctl',
    systemctlArgs(scope, 'show-environment'),
  );

export interface ServiceOptions {
  configPath: string;
  insecure?: boolean;
  log: (line: string) => void;
  scope: ServiceScope;
}

/** Creates the system account the host-wide service runs as; returns its group id. */
export async function ensureServiceUser(): Promise<number> {
  if (!(await succeeds('id', ['-u', SERVICE_USER]))) {
    await exec('useradd', [
      '--system',
      '--no-create-home',
      '--home-dir',
      '/nonexistent',
      '--shell',
      '/usr/sbin/nologin',
      SERVICE_USER,
    ]);
  }
  // cupsenable (re-enabling a stopped queue) needs lpadmin.
  if (await succeeds('getent', ['group', 'lpadmin'])) {
    await exec('usermod', ['-a', '-G', 'lpadmin', SERVICE_USER]);
  }
  return Number(await exec('id', ['-g', SERVICE_USER]));
}

/** Installs, enables, and (re)starts the agent's systemd unit; returns the manual command otherwise. */
export async function installService({
  configPath,
  insecure,
  log,
  scope,
}: ServiceOptions): Promise<void> {
  const cliPath = await permanentCli(scope, log);
  const node = await nodePath();
  const manual = [
    node,
    cliPath,
    'run',
    '--config',
    configPath,
    ...(insecure ? ['--insecure'] : []),
  ].join(' ');
  if (!(await systemdAvailable(scope))) {
    log(
      `systemd is not available, so no service was installed. Start the agent with:\n  ${manual}`,
    );
    return;
  }
  if (scope === 'system' && /^\/(home|root)\//.test(node)) {
    log(
      `Warning: the service runs as ${SERVICE_USER}, which may not be able to run ${node}.`,
    );
  }
  const path = unitPath(scope, homedir(), process.env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    renderUnit({
      cliPath,
      configPath,
      insecure,
      nodePath: node,
      scope,
    }),
    { mode: 0o644 },
  );
  await exec('systemctl', systemctlArgs(scope, 'daemon-reload'));
  await exec(
    'systemctl',
    systemctlArgs(scope, 'enable', SERVICE_UNIT),
  );
  await exec(
    'systemctl',
    systemctlArgs(scope, 'restart', SERVICE_UNIT),
  );
  log(`Installed and started ${path}.`);
  log(
    `Logs: journalctl ${scope === 'user' ? '--user-unit' : '-u'} ${SERVICE_NAME} -f`,
  );
  if (scope === 'user' && !(await lingering())) {
    log(
      'A user service stops when you log out and starts at your next login. To start it at boot:\n' +
        `  sudo loginctl enable-linger ${userInfo().username}`,
    );
  }
}

async function nodePath(): Promise<string> {
  const pathNode = await exec('sh', [
    '-c',
    'command -v node',
  ]).catch(() => undefined);
  return stableNodePath({
    execPath: process.execPath,
    execRealpath: await realpath(process.execPath),
    pathNode,
    pathNodeRealpath: pathNode
      ? await realpath(pathNode).catch(() => undefined)
      : undefined,
  });
}

/** The npm that belongs to the running node, else whatever is on PATH. */
async function npmPath(): Promise<string> {
  const beside = join(dirname(process.execPath), 'npm');
  return (await exists(beside)) ? beside : 'npm';
}

/**
 * The CLI a service should run. npx runs from a cache npm may prune, so in that case the same
 * version is installed for keeps: under ~/.local for a user, /usr/local for root.
 */
async function permanentCli(
  scope: ServiceScope,
  log: (line: string) => void,
): Promise<string> {
  const cliPath = await realpath(process.argv[1]!);
  if (!isEphemeralInstall(cliPath)) {
    return cliPath;
  }
  const prefix =
    scope === 'system'
      ? '/usr/local'
      : join(homedir(), '.local');
  log(`Installing ${PACKAGE}@${AGENT_VERSION} under ${prefix}…`);
  await exec(await npmPath(), [
    'install',
    '--global',
    '--prefix',
    prefix,
    '--no-fund',
    '--no-audit',
    `${PACKAGE}@${AGENT_VERSION}`,
  ]).catch((error: unknown) => {
    throw new CliError(
      `Could not install ${PACKAGE} under ${prefix}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  return join(
    prefix,
    'lib/node_modules',
    PACKAGE,
    'dist/cli.mjs',
  );
}

const lingering = (): Promise<boolean> =>
  exec('loginctl', [
    'show-user',
    userInfo().username,
    '--property=Linger',
  ]).then(
    (out) => out === 'Linger=yes',
    () => false,
  );
