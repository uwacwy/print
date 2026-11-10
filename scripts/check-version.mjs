// Usage: node scripts/check-version.mjs [v0.2.0]
// Fails unless every manifest has the same version (and it matches the tag, when given).
import {
  manifestPaths,
  readManifest,
  SEMVER,
} from './workspace-manifests.mjs';

const tag = process.argv[2]?.replace(/^refs\/tags\//, '');
const expected = tag?.replace(/^v/, '');
if (tag && !SEMVER.test(expected)) {
  console.error(`Tag ${tag} is not v<semver>.`);
  process.exit(1);
}

const versions = manifestPaths().map((path) => [
  path,
  readManifest(path).version,
]);
const wanted = expected ?? versions[0][1];
const mismatched = versions.filter(
  ([, version]) => version !== wanted,
);
if (mismatched.length) {
  for (const [path, version] of mismatched) {
    console.error(`${path} is ${version}, expected ${wanted}`);
  }
  console.error('Run: npm run version:set -- <version>');
  process.exit(1);
}
console.log(
  `All ${versions.length} manifests are at ${wanted}.`,
);
