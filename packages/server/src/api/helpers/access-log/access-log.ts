import type { RequestHandler } from 'express';
import winston from 'winston';
import { DailyLogFile } from '../daily-log-file/daily-log-file';
import { keyof } from 'zod';
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

type ParamSegmentSpec = { type: 'param'; name: string };
type StaticSegmentSpec = { type: 'static'; value: string };
const isParamSegmentSpec = (s: any): s is ParamSegmentSpec =>
  s.type === 'param';
const isStaticSegmentSpec = (s: any): s is StaticSegmentSpec =>
  s.type === 'static';

type RouteCodec = {
  parse(url: string | URL): Record<string, string> | null;
  build(params: Record<string, string>): URL;
};
/**
 * @example
 * const parseWidgetDetail = matchUrl('/widgets/:widgetId');
 * parseWidgetDetail('/widgets/123') => { widgetId: 123 }
 */
const route = (urlSpec: string): RouteCodec => {
  const segments = urlSpec.split('/');

  const segmentSpecs = segments.map((s, idx) => {
    if (s.startsWith(':')) {
      return { type: 'param', name: s.slice(1) };
    }
    return { type: 'static', value: s };
  });

  const parse = (url: string | URL) => {
    url = new URL(url, 'null://');
    const pathSegments = url.pathname.split('/');
    if (pathSegments.length !== segmentSpecs.length) {
      return null;
    }

    return segmentSpecs.reduce(
      (acc, s, i) => {
        if (isParamSegmentSpec(s)) {
          acc[s.name] = pathSegments[i];
        }
        return acc;
      },
      {} as Record<string, string>,
    );
  };

  const build = (params: Record<string, string>) => {
    const url = new URL('null://');

    url.pathname = segmentSpecs
      .map((s) => (isParamSegmentSpec(s) ? params[s.name] : s.value))
      .join('/');

    return url;
  };

  return {
    parse,
    build,
  };
};

const printerInstallUrl = route('/printer/:token/install');

const omitOrigin = (u: URL) =>
  u
    .toString()
    .slice(
      u.protocol.length +
        '//'.length +
        u.host.length +
        (u.port ? 1 + u.port.length : 0),
    );

type UrlArgs = Parameters<typeof URL.canParse>;

/**
 * Replaces credentials with `REDACTED`: query values (such as `?token=` on print links) and the
 * enrollment token segment of `/printer/<token>/install`.
 */
export const redactUrl = (
  url: string | URL,
  includeOrigin: boolean,
): string => {
  const forms: (() => UrlArgs)[] = [
    () => [url],
    () => [url, 'null://'],
  ];
  const args = forms.find((getArgs) => URL.canParse(...getArgs()));
  if (!args) {
    throw new Error('Invalid URL');
  }
  const u = new URL(...args());
  const redacted = redactQuery(u);

  const routes = [printerInstallUrl];

  for (const r of routes) {
    const parsed = r.parse(u);
    if (parsed) {
      const built = r.build({
        ...parsed,
        ...[...SECRET_PARAMS].reduce(
          (acc, k) => ({
            ...acc,
            [k]: 'REDACTED',
          }),
          {},
        ),
      });

      // at the time, routes STRIP query and hash, so restore from u
      built.search = u.search;
      built.hash = u.hash;

      const redacted = redactQuery(built);

      return includeOrigin
        ? redacted.toString()
        : omitOrigin(redacted);
    }
  }

  return includeOrigin ? redacted.toString() : omitOrigin(redacted);

  // return redactQuery(url.toString().slice(u.origin.length));
};

function redactQuery(u: URL): URL {
  u.search = [...u.searchParams.entries()]
    .reduce((params, [key, value]) => {
      params.append(
        key,
        SECRET_PARAMS.has(key.toLowerCase()) ? 'REDACTED' : value,
      );
      return params;
    }, new URLSearchParams())
    .toString();

  // return u.origin;
  return u;
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
        url: redactUrl(request.originalUrl, false),
        httpVersion: request.httpVersion,
        status: response.statusCode,
        bytes: Number.isFinite(length) ? length : undefined,
        durationMs:
          Math.round(
            Number(process.hrtime.bigint() - started) / 10_000,
          ) / 100,
        referrer: referrer ? redactUrl(referrer, true) : undefined,
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
