import type { PrintJob } from '../../types';

/** A job title safe for `lp -t` and IPP `job-name`: no control characters, at most 120 chars. */
export const jobTitle = (job: PrintJob): string =>
  // Control characters are exactly what this replaces.
  // eslint-disable-next-line no-control-regex
  job.title.replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 120) ||
  'Print job';

/** An error's message trimmed for a status report, or `fallback` for non-Error values. */
export const errorMessage = (
  error: unknown,
  fallback: string,
): string =>
  error instanceof Error ? error.message.slice(0, 500) : fallback;
