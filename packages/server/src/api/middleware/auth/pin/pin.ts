import { randomInt, timingSafeEqual } from 'node:crypto';
import type { PrinterRow } from '../../../../lib/database/database.js';

export const PIN_LENGTH = 9;

export function generatePin(): string {
  return String(randomInt(0, 10 ** PIN_LENGTH)).padStart(
    PIN_LENGTH,
    '0',
  );
}

/** Formats a PIN as three hyphenated groups (111-222-333) for display. */
export function formatPin(pin: string): string {
  return pin.match(/\d{3}/g)?.join('-') ?? pin;
}

/** Accepts the PIN with or without separators; compares in constant time. */
export function pinMatches(
  printer: Pick<PrinterRow, 'pin'>,
  entered: unknown,
): boolean {
  if (!printer.pin || typeof entered !== 'string') {
    return false;
  }
  const digits = entered.replace(/[\s-]/g, '');
  if (
    !/^\d+$/.test(digits) ||
    digits.length !== printer.pin.length
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(digits),
    Buffer.from(printer.pin),
  );
}
