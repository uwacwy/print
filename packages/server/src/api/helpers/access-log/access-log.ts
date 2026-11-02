import type { RequestHandler } from 'express';
import winston from 'winston';
import { DailyLogFile } from '../daily-log-file/daily-log-file';

export interface AccessLogEntry {
  timestamp?: string;
  ip: string | undefined;
  method: string;
  url: string;
  httpVersion: string;
  status: number;
  /** Response body size from Content-Length, when the response declared one. */
  bytes: number | undefined;
  durationMs: number;
  referrer: string | undefined;
  userAgent: string | undefined;
  /** The client went away before the response finished. */
  aborted?: true;
}

export interface AccessLogSink {
  info(entry: AccessLogEntry): void;
}

export interface AccessLog {
  middleware: RequestHandler;
  close(): Promise<void>;
}

/** Query parameters whose values are credentials and must never reach the log. */
const SECRET_PARAMS = new Set([
  'token',
  'access_token',
  'id_token',
  'code',
  'pin',
  'password',
  'secret',
]);

/** Paths polled by health checks; logging them buries real traffic. */
const UNLOGGED_PATHS = new Set(['/api/healthz']);

/** Replaces credential query values (such as `?token=` on print links) with `REDACTED`. */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart < 0) {
    return url;
  }
  const hashStart = url.indexOf('#', queryStart);
  const query = url.slice(
    queryStart + 1,
    hashStart < 0 ? undefined : hashStart,
  );
  const redacted = query
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      const name = separator < 0 ? pair : pair.slice(0, separator);
      return separator >= 0 && isSecretParam(name)
        ? `${name}=REDACTED`
        : pair;
    })
    .join('&');
  return `${url.slice(0, queryStart)}?${redacted}${hashStart < 0 ? '' : url.slice(hashStart)}`;
}

function isSecretParam(name: string): boolean {
  try {
    return SECRET_PARAMS.has(
      decodeURIComponent(name.replace(/\+/g, ' ')).toLowerCase(),
    );
  } catch {
    return true;
  }
}

/** Logs one entry per request once the response finishes or the client disconnects. */
export function accessLogMiddleware(
  sink: AccessLogSink,
): RequestHandler {
  return (request, response, next) => {
    if (UNLOGGED_PATHS.has(request.path)) {
      next();
      return;
    }
    const started = process.hrtime.bigint();
    let logged = false;
    const log = (aborted: boolean) => {
      if (logged) {
        return;
      }
      logged = true;
      const length = Number(response.getHeader('content-length'));
      const referrer = request.get('referer');
      sink.info({
        ip: request.ip,
        method: request.method,
        url: redactUrl(request.originalUrl),
        httpVersion: request.httpVersion,
        status: response.statusCode,
        bytes: Number.isFinite(length) ? length : undefined,
        durationMs:
          Math.round(
            Number(process.hrtime.bigint() - started) / 10_000,
          ) / 100,
        referrer: referrer ? redactUrl(referrer) : undefined,
        userAgent: request.get('user-agent'),
        ...(aborted ? { aborted: true as const } : {}),
      });
    };
    response.once('finish', () => log(false));
    response.once('close', () => log(!response.writableFinished));
    next();
  };
}

export interface AccessLogFileOptions {
  /** Directory for `access.log` and its dated rotations. */
  dir: string;
  /** Days of rotated files to keep. */
  maxDays: number;
}

const ACCESS_LOG_KEY = Symbol.for('@uwacwy/print/access-log');

interface CachedAccessLog extends AccessLog {
  dir: string;
  maxDays: number;
}

/**
 * JSON lines in `<dir>/access-YYYY-MM-DD.log`, rotated daily and pruned after `maxDays`.
 * `<dir>/access.log` is a symlink to the current day's file, so `tail -F` follows rotations.
 * One logger per process survives `ng serve` re-evaluations of server.ts.
 */
export function openAccessLog(
  options: AccessLogFileOptions,
): AccessLog {
  const store = globalThis as Record<
    symbol,
    CachedAccessLog | undefined
  >;
  const existing = store[ACCESS_LOG_KEY];
  if (
    existing &&
    existing.dir === options.dir &&
    existing.maxDays === options.maxDays
  ) {
    return existing;
  }
  void existing?.close();

  const file = new DailyLogFile({
    dir: options.dir,
    prefix: 'access',
    maxDays: options.maxDays,
  });
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports: [new winston.transports.Stream({ stream: file })],
  });
  let closing: Promise<void> | undefined;
  const accessLog: CachedAccessLog = {
    dir: options.dir,
    maxDays: options.maxDays,
    middleware: accessLogMiddleware({
      info: (entry) => logger.info({ message: 'request', ...entry }),
    }),
    close: () =>
      (closing ??= new Promise<void>((resolve) => {
        if (store[ACCESS_LOG_KEY] === accessLog) {
          store[ACCESS_LOG_KEY] = undefined;
        }
        // Winston drains its queue before 'finish'; then the file can be flushed and closed.
        logger.once('finish', () => file.end(() => resolve()));
        logger.end();
      })),
  };
  store[ACCESS_LOG_KEY] = accessLog;
  return accessLog;
}
