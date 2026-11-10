const MAX_SLUG_LENGTH = 63;

/** Turns a human printer name into a `PRINTER_SLUG_PATTERN`-safe slug; empty when nothing usable is left. */
export const slugify = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
