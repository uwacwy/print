import type { SiteLogo } from '@uwacwy/print-shared';

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Logo file names, most preferred first. */
export const LOGO_FILES = [
  'logo.svg',
  'logo.png',
  'logo.jpg',
  'logo.jpeg',
] as const;

/** The preferred logo among a directory's file names, if any. */
export const pickLogoFile = (
  names: readonly string[],
): string | undefined =>
  LOGO_FILES.find((candidate) => names.includes(candidate));

/** Static files are cached for a year, so the URL changes whenever the file does. */
export const logoSrc = (
  name: string,
  modifiedMs: number,
): string => `/${name}?v=${Math.trunc(modifiedMs).toString(36)}`;

/** The logo an operator dropped into the static `dir`, or undefined when there is none. */
export function findLogo(
  dir: string,
  alt: string,
): SiteLogo | undefined {
  const name = pickLogoFile(
    existsSync(dir) ? readdirSync(dir) : [],
  );
  return name
    ? {
        alt,
        src: logoSrc(name, statSync(join(dir, name)).mtimeMs),
      }
    : undefined;
}
