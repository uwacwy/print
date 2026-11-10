// npm prepack/postpack helper, run from a workspace directory.
//   node ../../scripts/prepack.mjs <required build output...>  checks the build exists, copies LICENSE in
//   node ../../scripts/prepack.mjs --clean                     removes the copied LICENSE
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const license = join(process.cwd(), 'LICENSE');
const args = process.argv.slice(2);

if (args[0] === '--clean') {
  rmSync(license, { force: true });
} else {
  const missing = args.filter((file) => !existsSync(file));
  if (missing.length) {
    console.error(
      `Missing build output: ${missing.join(', ')}. Run \`npm run build\` at the repo root first.`,
    );
    process.exit(1);
  }
  copyFileSync(
    join(import.meta.dirname, '..', 'LICENSE'),
    license,
  );
}
