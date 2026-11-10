export const DEFAULT_API_ERROR =
  'Request failed. Check the printer fields and try again.';

/** The `{ error: string }` message of a failed HTTP response, or `fallback`. */
export function apiErrorMessage(
  error: unknown,
  fallback = DEFAULT_API_ERROR,
): string {
  // rxResource may wrap non-Error values in `cause`.
  const source =
    error instanceof Error && error.cause !== undefined
      ? error.cause
      : error;
  return typeof source === 'object' &&
    source !== null &&
    'error' in source &&
    typeof source.error === 'object' &&
    source.error !== null &&
    'error' in source.error &&
    typeof source.error.error === 'string'
    ? source.error.error
    : fallback;
}

const causeOf = (error: unknown): unknown =>
  error instanceof Error && error.cause !== undefined
    ? error.cause
    : error;

/** The machine-readable `{ error: { code } }` of a failed HTTP response. */
export function apiErrorCode(
  error: unknown,
): string | undefined {
  const source = causeOf(error);
  return typeof source === 'object' &&
    source !== null &&
    'error' in source &&
    typeof source.error === 'object' &&
    source.error !== null &&
    'code' in source.error &&
    typeof source.error.code === 'string'
    ? source.error.code
    : undefined;
}

/** HTTP status behind a failed request or resource error. */
export function httpStatus(error: unknown): number | undefined {
  const source = causeOf(error);
  return typeof source === 'object' &&
    source !== null &&
    'status' in source &&
    typeof source.status === 'number'
    ? source.status
    : undefined;
}
