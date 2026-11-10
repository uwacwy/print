import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const repoRoot = join(import.meta.dirname, '..');

/** The root manifest and every workspace manifest; all share one release version. */
export function manifestPaths() {
  const root = JSON.parse(
    readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  );
  return [
    'package.json',
    ...root.workspaces.map((workspace) =>
      join(workspace, 'package.json'),
    ),
  ];
}

export function readManifest(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
