import { describe, expect, it } from 'vitest';
import {
  parseAgentToken,
  parseEnrollToken,
  parseName,
  parsePrinterUri,
  parseServerUrl,
  parseSlug,
  promptValidator,
} from './flag-parsers';

describe('flag parsers', () => {
  it('reduces server URLs to their origin', () => {
    expect(
      parseServerUrl(' https://print.example.org/manage '),
    ).toBe('https://print.example.org');
    expect(parseServerUrl('http://localhost:8080')).toBe(
      'http://localhost:8080',
    );
    expect(() => parseServerUrl('ftp://x')).toThrow('https');
    expect(() => parseServerUrl('print.example.org')).toThrow('URL');
  });

  it('checks token shapes', () => {
    expect(parseEnrollToken(`${'a'.repeat(43)}_ `)).toHaveLength(44);
    expect(() => parseEnrollToken('a'.repeat(43))).toThrow('44');
    expect(parseAgentToken('-'.repeat(43))).toHaveLength(43);
    expect(() => parseAgentToken('a'.repeat(44))).toThrow('43');
  });

  it('accepts printer URIs the drivers understand', () => {
    expect(
      parsePrinterUri('cups://Front_Desk?option_sides=one-sided'),
    ).toBe('cups://Front_Desk?option_sides=one-sided');
    expect(parsePrinterUri('ipps://printer.local/ipp/print')).toBe(
      'ipps://printer.local/ipp/print',
    );
    expect(() => parsePrinterUri('lpd://printer')).toThrow(
      'cups://',
    );
    expect(() => parsePrinterUri('Front_Desk')).toThrow('cups://');
  });

  it('checks slugs and names', () => {
    expect(parseSlug(' Front-Desk ')).toBe('front-desk');
    expect(() => parseSlug('front desk')).toThrow('lowercase');
    expect(parseName(' Front Desk ')).toBe('Front Desk');
    expect(() => parseName(' ')).toThrow('1 to 100');
  });

  it('turns parse errors into prompt messages', () => {
    const validate = promptValidator(parseSlug);
    expect(validate('ok')).toBe(true);
    expect(validate('not ok')).toBe(
      'Value must be lowercase letters, numbers, and hyphens (max 63).',
    );
  });
});
