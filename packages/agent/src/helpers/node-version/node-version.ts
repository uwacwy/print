/** Oldest Node.js the agent supports (`@inquirer/prompts` needs 20.17). Keep in sync with `engines`. */
export const MIN_NODE_VERSION = '20.17.0';

/** `[major, minor, patch]` from `v20.17.0`, `20.17.0`, or `20.17.0-pre`; `undefined` when unparsable. */
export function parseVersion(
  version: string,
): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
}

export function satisfiesMinimum(
  version: string,
  minimum = MIN_NODE_VERSION,
): boolean {
  const actual = parseVersion(version);
  const floor = parseVersion(minimum);
  if (!actual || !floor) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== floor[i]) {
      return actual[i]! > floor[i]!;
    }
  }
  return true;
}
