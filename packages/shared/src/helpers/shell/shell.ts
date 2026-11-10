/** Quotes a value for POSIX shells: `it's` → `'it'\''s'`. Safe for any string, including empty. */
export const shq = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

/** Leaves simple words unquoted so pasted commands stay readable. */
export const shArg = (value: string): string =>
  /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : shq(value);
