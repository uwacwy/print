export const PIN_DIGITS = 9;
export const PIN_HINT =
  'Enter the 9-digit PIN posted at the printer.';
/** Matches the formatted PIN, e.g. `123-456-789`. */
export const PIN_PATTERN = /^\d{3}-\d{3}-\d{3}$/;
/** The formatted length, so typing stops at ###-###-###. */
export const PIN_MAX_LENGTH = PIN_DIGITS + 2;

/** Formats up to nine digits as ###-###-### while the user types. */
export function formatPinInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, PIN_DIGITS);
  return digits.match(/.{1,3}/g)?.join('-') ?? '';
}
