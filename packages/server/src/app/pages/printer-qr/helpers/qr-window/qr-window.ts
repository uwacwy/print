export interface QrWindow {
  /** datetime-local value */
  expiresAt: string;
  /** datetime-local value */
  notBefore: string;
}

export interface UntilPreset {
  label: string;
  /** datetime-local value */
  value: string;
}

export const DEFAULT_WINDOW_MS = 24 * 3_600_000;
export const NUDGE_MINUTES = 15;
const PRESET_COUNT = 8;

/** Formats a date for `<input type="datetime-local">`, which expects local wall-clock time. */
export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A window starting now and lasting 24 hours. */
export const defaultWindow = (now: Date): QrWindow => ({
  expiresAt: toLocalInput(
    new Date(now.getTime() + DEFAULT_WINDOW_MS),
  ),
  notBefore: toLocalInput(now),
});

/** Shifts a datetime-local value by whole minutes; undefined when it is not a valid date. */
export function shiftLocalInput(
  value: string,
  minutes: number,
): string | undefined {
  const current = Date.parse(value);
  return Number.isFinite(current)
    ? toLocalInput(new Date(current + minutes * 60_000))
    : undefined;
}

/** The ISO timestamps the API expects for a window entered in local time. */
export const toIsoWindow = ({
  expiresAt,
  notBefore,
}: QrWindow) => ({
  expiresAt: new Date(expiresAt).toISOString(),
  notBefore: new Date(notBefore).toISOString(),
});

/** Presets count from the window's start when it is still in the future, otherwise from now. */
export function presetsForWindow(now: Date, notBefore: string) {
  const start = Date.parse(notBefore);
  return untilPresets(
    Number.isFinite(start) && start > now.getTime()
      ? new Date(start)
      : now,
  );
}

/**
 * Whole-hour end times in the browser's time zone, starting with the first hour after
 * `from`. Hours on a later day than `from` are labelled with the weekday.
 */
export function untilPresets(
  from: Date,
  count = PRESET_COUNT,
): UntilPreset[] {
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  first.setHours(first.getHours() + 1);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
  });
  const dayAndTime = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    weekday: 'short',
  });
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(first);
    at.setHours(first.getHours() + index);
    const sameDay = at.toDateString() === from.toDateString();
    return {
      label: (sameDay ? time : dayAndTime).format(at),
      value: toLocalInput(at),
    };
  });
}

/** An error message when the window ends at or before it starts. */
export function windowOrderError(
  notBefore: string,
  expiresAt: string,
): string | undefined {
  const start = Date.parse(notBefore);
  const end = Date.parse(expiresAt);
  return Number.isFinite(start) &&
    Number.isFinite(end) &&
    end <= start
    ? 'Must be after the start time.'
    : undefined;
}
