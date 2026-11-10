import { locatePath } from 'locate-path';
import { constants } from 'node:fs';
import {
  access,
  chown,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { CliError, EXIT_USAGE } from '../cli-error/cli-error';
import {
  type AgentConfig,
  parseConfigFile,
  type PartialAgentConfig,
  permissionWarning,
  serializeConfig,
} from '../config/config';

/** The first candidate that exists as a file. */
export const locateConfig = (
  candidates: readonly string[],
): Promise<string | undefined> =>
  locatePath(candidates, { type: 'file' });

export interface LoadedConfig {
  path: string;
  values: PartialAgentConfig;
  warning?: string;
}

export async function readConfig(
  path: string,
): Promise<LoadedConfig> {
  const [text, info] = await Promise.all([
    readFile(path, 'utf8'),
    stat(path),
  ]);
  return {
    path,
    values: parseConfigFile(text),
    warning: permissionWarning(path, info.mode),
  };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** `preferred` when writable, else the first writable candidate. */
export async function firstWritable(
  preferred: string,
  candidates: readonly string[],
): Promise<string | undefined> {
  for (const path of [
    preferred,
    ...candidates.filter((c) => c !== preferred),
  ]) {
    if (await canWrite(path)) {
      return path;
    }
  }
  return undefined;
}

/** `--config` when given (it must exist), else the first config found among `candidates`. */
export async function loadConfigFile(
  explicit: string | undefined,
  candidates: readonly string[],
): Promise<LoadedConfig | undefined> {
  if (explicit) {
    if (!(await exists(explicit))) {
      throw new CliError(
        `Config file ${explicit} does not exist.`,
        EXIT_USAGE,
      );
    }
    return readConfig(explicit);
  }
  const found = await locateConfig(candidates);
  return found ? readConfig(found) : undefined;
}

/** Whether `path` could be created or replaced: its directory exists (or can be) and is writable. */
async function canWrite(path: string): Promise<boolean> {
  let dir = dirname(path);
  while (!(await exists(dir))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return false;
    }
    dir = parent;
  }
  return access(dir, constants.W_OK).then(
    () => true,
    () => false,
  );
}

export const configExists = exists;

export interface WriteOptions {
  /** Group that may read the file (host-wide installs). */
  gid?: number;
  /** File mode; 0600 for a user's config, 0640 for host-wide config readable by the service group. */
  mode: number;
  /** Keep an existing file's mode and group instead. */
  preserve?: boolean;
}

/** Writes via a temp file and rename, so a crash never leaves a half-written token file. */
export async function writeConfig(
  path: string,
  config: AgentConfig,
  { gid: newGid, mode: newMode, preserve = false }: WriteOptions,
): Promise<void> {
  const existing = preserve
    ? await stat(path).catch(() => undefined)
    : undefined;
  const mode = existing ? existing.mode & 0o777 : newMode;
  const gid =
    existing && process.getuid?.() === 0 ? existing.gid : newGid;
  const dir = dirname(path);
  await mkdir(dir, { mode: 0o700, recursive: true });
  const temp = join(
    dir,
    `.${basename(path)}.${process.pid}.tmp`,
  );
  const handle = await open(temp, 'w', mode);
  try {
    await handle.writeFile(serializeConfig(config));
    await handle.chmod(mode);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (gid !== undefined) {
      await chown(temp, 0, gid);
    }
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
