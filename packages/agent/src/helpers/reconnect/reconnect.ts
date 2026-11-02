export const INITIAL_RETRY_MS = 1000;
export const MAX_RETRY_MS = 60_000;

/** Doubles the retry delay, capped at `MAX_RETRY_MS`. */
export const nextRetryDelay = (delay: number): number =>
  Math.min(delay * 2, MAX_RETRY_MS);

/** Adds up to a third of `delay` so agents don't reconnect in lockstep. */
export const withJitter = (
  delay: number,
  random: () => number = Math.random,
): number => delay + Math.floor((random() * delay) / 3);

/** Milliseconds as whole seconds, never less than 1. */
export const toWholeSeconds = (ms: number): number =>
  Math.max(1, Math.round(ms / 1000));

export const formatSeconds = (count: number): string =>
  `${count} second${count === 1 ? '' : 's'}`;

/** Transport failures only say "websocket error"; a rejected handshake says why. */
export const connectErrorDetail = ({ message }: Error): string =>
  message && message !== 'websocket error' ? ` (${message})` : '';
