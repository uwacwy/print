// Usage: npm run version:set -- 0.2.0
// Sets the version of the root and every workspace, plus internal dependency pins, in lockstep.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  manifestPaths,
  readManifest,
  repoRoot,
  SEMVER,
} from './workspace-manifests.mjs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version || !SEMVER.test(version)) {
  console.error(
    'Usage: npm run version:set -- <semver>   (e.g. 0.2.0 or 0.2.0-rc.1)',
  );
  process.exit(2);
}

const manifests = manifestPaths().map((path) => [
  path,
  readManifest(path),
]);
const internal = new Set(
  manifests.map(([, manifest]) => manifest.name),
);

for (const [path, manifest] of manifests) {
  manifest.version = version;
  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (internal.has(name)) {
        manifest[field][name] = version;
      }
    }
  }
  writeFileSync(
    join(repoRoot, path),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`${path} -> ${version}`);
}

// Refresh the lockfile's workspace entries without touching third-party resolutions.
execFileSync(
  'npm',
  ['install', '--package-lock-only', '--ignore-scripts'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);

execFileSync('git', ['add', '.'], { cwd: repoRoot });

execFileSync('git', ['commit', '-m', `v${version}`], {
  cwd: repoRoot,
});

execFileSync('git', ['tag', `v${version}`], { cwd: repoRoot });
