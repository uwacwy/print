import type {
  PrintDocumentFormat,
  PrinterOptionName,
  PrinterOptions,
  PrintQuality,
} from '../../types';

export const DEFAULT_PRINTER_OPTIONS: PrinterOptions = {
  maxBytes: 100 * 1024 * 1024,
  mimeTypes: ['application/pdf'],
  timeoutMs: 120_000,
};

const QUALITIES: readonly PrintQuality[] = [
  'draft',
  'normal',
  'high',
];
const FORMATS: readonly PrintDocumentFormat[] = [
  'application/pdf',
  'application/PCLm',
];
const MIME_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

function oneOf<T extends string>(
  name: string,
  value: string,
  allowed: readonly T[],
): T {
  const match = allowed.find((each) => each === value);
  if (!match) {
    throw new Error(
      `PRINTER_URI ${name} must be one of ${allowed.join(', ')}.`,
    );
  }
  return match;
}

function positiveInteger(
  name: string,
  value: string,
  minimum: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(
      `PRINTER_URI ${name} must be an integer of at least ${minimum}.`,
    );
  }
  return parsed;
}

const PARSERS: Record<
  PrinterOptionName,
  (value: string) => Partial<PrinterOptions>
> = {
  dpi: (value) => ({
    dpi: value === '0' ? 0 : positiveInteger('dpi', value, 72),
  }),
  format: (value) => ({
    format: oneOf('format', value, FORMATS),
  }),
  maxBytes: (value) => ({
    maxBytes: positiveInteger('maxBytes', value, 1024),
  }),
  mimeTypes: (value) => {
    const mimeTypes = value
      .split(',')
      .map((each) => each.trim())
      .filter(Boolean);
    if (
      !mimeTypes.length ||
      !mimeTypes.every((each) => MIME_TYPE.test(each))
    ) {
      throw new Error(
        'PRINTER_URI mimeTypes must be a comma-separated list of media types.',
      );
    }
    return { mimeTypes };
  },
  quality: (value) => ({
    quality: oneOf('quality', value, QUALITIES),
  }),
  timeout: (value) => ({
    timeoutMs: positiveInteger('timeout', value, 1000),
  }),
};

/** True when a response's Content-Type (parameters ignored) is one the printer accepts. */
export function acceptsMimeType(
  options: Pick<PrinterOptions, 'mimeTypes'>,
  contentType: null | string,
): boolean {
  const type = contentType
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    !!type &&
    options.mimeTypes.some((each) => each.toLowerCase() === type)
  );
}

/**
 * Splits `scheme://destination?option=value` into the bare destination and its options.
 * Unknown or repeated options are rejected so typos don't silently fall back to defaults.
 */
export function parsePrinterConnection(
  conn: string | URL,
  supported: readonly PrinterOptionName[],
  defaults: Partial<PrinterOptions> = {},
): { options: PrinterOptions; uri: URL } {
  let uri: URL;
  try {
    uri = new URL(conn);
  } catch {
    throw new Error('PRINTER_URI must be a valid URL.');
  }
  const options: PrinterOptions = {
    ...DEFAULT_PRINTER_OPTIONS,
    ...defaults,
  };
  const seen = new Set<string>();
  for (const [name, value] of uri.searchParams) {
    const option = supported.find((each) => each === name);
    if (!option) {
      throw new Error(
        `PRINTER_URI option "${name}" is not supported here (use ${supported.join(', ')}).`,
      );
    }
    if (seen.has(name)) {
      throw new Error(
        `PRINTER_URI option "${name}" is repeated.`,
      );
    }
    seen.add(name);
    Object.assign(options, PARSERS[option](value));
  }
  const bare = new URL(uri);
  bare.search = '';
  return { options, uri: bare };
}
