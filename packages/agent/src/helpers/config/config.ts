import { isAllowedServerUrl } from '@uwacwy/print-shared';
import { posix } from 'node:path';
// Experimental before Node 24.10, but present and quiet from 20.12, below the agent's 20.17 floor.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { parseEnv } from 'node:util';

import {
  parseAgentToken,
  parsePrinterUri,
  parseServerUrl,
} from '../flag-parsers/flag-parsers';

export const CONFIG_FILE_NAME = 'uwacwy-print-agent.env';
export const CONFIG_KEYS = [
  'PRINT_SERVER_URL',
  'PRINT_AGENT_TOKEN',
  'PRINTER_URI',
] as const;

export type AgentConfig = Record<ConfigKey, string>;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type PartialAgentConfig = Partial<AgentConfig>;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Where `run` looks for its config, least to most sensitive: per-user, then locally installed
 * software (`/usr/local/etc`, matching `npm -g --prefix /usr/local`), then host-wide `/etc`.
 */
export function configCandidates(
  env: Env,
  homedir: string,
): string[] {
  const xdg = env['XDG_CONFIG_HOME'];
  const userDir =
    xdg && posix.isAbsolute(xdg)
      ? xdg
      : posix.join(homedir, '.config');
  return [userDir, '/usr/local/etc', '/etc'].map((dir) =>
    posix.join(dir, CONFIG_FILE_NAME),
  );
}

/** Root writes host-wide config; everyone else writes their own. */
export const defaultWriteTarget = (
  uid: number,
  candidates: readonly string[],
): string => (uid === 0 ? candidates.at(-1)! : candidates[0]!);

/** The agent's keys from an env-like record, ignoring blanks. */
export function pickConfig(source: Env): PartialAgentConfig {
  const config: PartialAgentConfig = {};
  for (const key of CONFIG_KEYS) {
    const value = source[key]?.trim();
    if (value) {
      config[key] = value;
    }
  }
  return config;
}

/** Environment variables win over the file. */
export const mergeConfig = (
  env: Env,
  file: Env,
): PartialAgentConfig => ({
  ...pickConfig(file),
  ...pickConfig(env),
});

export const missingKeys = (
  config: PartialAgentConfig,
): ConfigKey[] => CONFIG_KEYS.filter((key) => !config[key]);

export const isComplete = (
  config: PartialAgentConfig,
): config is AgentConfig => missingKeys(config).length === 0;

export const parseConfigFile = (
  text: string,
): PartialAgentConfig => pickConfig(parseEnv(text));

/** Problems with a complete config, phrased for the operator. */
export function configErrors(
  config: AgentConfig,
  { insecure = false }: { insecure?: boolean } = {},
): string[] {
  const errors: string[] = [];
  const check = (
    key: ConfigKey,
    parse: (value: string) => unknown,
  ) => {
    try {
      parse(config[key]);
    } catch (error) {
      errors.push(
        `${key} ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  };
  check('PRINT_SERVER_URL', parseServerUrl);
  if (
    !errors.length &&
    !isAllowedServerUrl(config.PRINT_SERVER_URL, { insecure })
  ) {
    errors.push(
      'PRINT_SERVER_URL must use https:// (plain http:// is allowed only on localhost).',
    );
  }
  check('PRINT_AGENT_TOKEN', parseAgentToken);
  check('PRINTER_URI', parsePrinterUri);
  return errors;
}

/** Single-quoted dotenv values are taken literally, so URIs with `#`, `&`, or `$` survive. */
export function serializeConfig(config: AgentConfig): string {
  const lines = CONFIG_KEYS.map((key) => {
    const value = config[key];
    if (/['\r\n]/.test(value)) {
      throw new Error(
        `${key} must not contain quotes or line breaks.`,
      );
    }
    return `${key}='${value}'`;
  });
  return [
    '# Written by `uwacwy-print-agent install`. Holds the agent token; keep it private.',
    ...lines,
    '',
  ].join('\n');
}

/** A warning when a config file holding a token is readable by everyone. */
export const permissionWarning = (
  path: string,
  mode: number,
): string | undefined =>
  mode & 0o007
    ? `${path} is readable by other users (mode ${(mode & 0o777).toString(8)}); run chmod o-rwx ${path}.`
    : undefined;

/** Non-interactive `run`/`install` guidance when settings are missing. */
export function missingSettingsMessage(
  missing: readonly string[],
  candidates: readonly string[],
  printers?: string,
): string {
  return [
    `Missing settings: ${missing.join(', ')}.`,
    'Set them as environment variables or in a config file, which is searched for at:',
    ...candidates.map((path) => `  ${path}`),
    'Or run `uwacwy-print-agent install` at a terminal to be prompted and save them.',
    ...(printers
      ? [
          '',
          'Printers this computer can use (for PRINTER_URI):',
          printers,
        ]
      : []),
  ].join('\n');
}
