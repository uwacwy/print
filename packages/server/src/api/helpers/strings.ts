/** Strips path separators and control characters from an uploaded file name. */
export function cleanFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return (
    name.replace(/[\\/\0-\x1f]/g, '').slice(0, 180) || 'document'
  );
}

/** Parses a positive integer route parameter, or undefined when it is not one. */
export function parsePositiveInt(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
