import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `${dataDir}/public`: static files an operator drops into the data volume. Created when missing so
 * it is visible to copy into; undefined when something that is not a directory is in the way or the
 * directory cannot be created.
 */
export function ensurePublicDir(
  dataDir: string,
): string | undefined {
  const dir = join(dataDir, 'public');
  try {
    mkdirSync(dir, { recursive: true });
    return statSync(dir).isDirectory() ? dir : undefined;
  } catch {
    return undefined;
  }
}
