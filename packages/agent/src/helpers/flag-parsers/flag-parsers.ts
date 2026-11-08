import { PRINTER_SLUG_PATTERN } from '@uwacwy/print-shared';

const ENROLL_TOKEN = /^[A-Za-z0-9_-]{44}$/;
const AGENT_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PRINTER_SCHEMES = new Set([
  'cups:',
  'ipp:',
  'ipps:',
  'http:',
  'https:',
]);

/** A print server address reduced to its origin; the HTTPS policy is applied separately (`--insecure`). */
export function parseServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      'must be a URL such as https://print.example.org',
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('must be an https:// URL');
  }
  return url.origin;
}

export function parseEnrollToken(value: string): string {
  const token = value.trim();
  if (!ENROLL_TOKEN.test(token)) {
    throw new Error(
      'must be the 44-character enrollment token from the "Add printer" page',
    );
  }
  return token;
}

export function parseAgentToken(value: string): string {
  const token = value.trim();
  if (!AGENT_TOKEN.test(token)) {
    throw new Error(
      'must be the 43-character agent token shown when the printer was added',
    );
  }
  return token;
}

/** `cups://Queue`, `ipp://`, or `ipps://` (also `http(s)://` IPP endpoints). */
export function parsePrinterUri(value: string): string {
  const uri = value.trim();
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('must be cups://<queue> or ipp://<host>/<path>');
  }
  if (!PRINTER_SCHEMES.has(url.protocol)) {
    throw new Error('must be cups://<queue> or ipp://<host>/<path>');
  }
  return uri;
}

export function parseSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!PRINTER_SLUG_PATTERN.test(slug)) {
    throw new Error(
      'must be lowercase letters, numbers, and hyphens (max 63)',
    );
  }
  return slug;
}

export function parseName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 100) {
    throw new Error('must be 1 to 100 characters');
  }
  return name;
}

/** Adapts a throwing parser into an `@inquirer/prompts` `validate` callback. */
export const promptValidator =
  (parse: (value: string) => unknown) =>
  (value: string): true | string => {
    try {
      parse(value);
      return true;
    } catch (error) {
      return `Value ${error instanceof Error ? error.message : String(error)}.`;
    }
  };
