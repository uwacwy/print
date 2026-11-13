/** `'app engine'` becomes `'appEngine'`; spaces, hyphens, and underscores separate words. */
export type CamelCase<S extends string> = CamelCaseOn<
  CamelCaseOn<CamelCaseOn<S, ' '>, '-'>,
  '_'
>;

export interface Logger {
  /** Nested loggers whose output carries this logger's scopes first. */
  create<const T extends readonly string[]>(
    ...scopes: T
  ): ScopedLoggers<T>;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

/** One logger per scope, keyed by the camelCase scope name. */
export type ScopedLoggers<T extends readonly string[]> = {
  readonly [K in T[number] as CamelCase<K>]: Logger;
};

type CamelCaseOn<
  S extends string,
  Sep extends string,
> = S extends `${infer Head}${Sep}${infer Rest}`
  ? `${Head}${Capitalize<CamelCaseOn<Rest, Sep>>}`
  : S;

const toCamelCase = <S extends string>(scope: S) =>
  scope.replace(/[ _-](.)/g, (_, char: string) =>
    char.toUpperCase(),
  ) as CamelCase<S>;

/** Keeps the prefix in the first argument so printf-style placeholders there still work. */
const withPrefix = (prefix: string, args: unknown[]) =>
  typeof args[0] === 'string'
    ? [`${prefix} ${args[0]}`, ...args.slice(1)]
    : [prefix, ...args];

class ScopedLogger implements Logger {
  private readonly prefix: string;

  constructor(private readonly path: readonly string[]) {
    this.prefix = path.map((scope) => `[${scope}]`).join('');
  }

  create<const T extends readonly string[]>(...scopes: T) {
    return createScoped(this.path, scopes);
  }

  debug(...args: unknown[]): void {
    console.debug(...withPrefix(this.prefix, args));
  }

  error(...args: unknown[]): void {
    console.error(...withPrefix(this.prefix, args));
  }

  info(...args: unknown[]): void {
    console.info(...withPrefix(this.prefix, args));
  }

  log(...args: unknown[]): void {
    console.log(...withPrefix(this.prefix, args));
  }

  warn(...args: unknown[]): void {
    console.warn(...withPrefix(this.prefix, args));
  }
}

const createScoped = <const T extends readonly string[]>(
  parents: readonly string[],
  scopes: T,
) =>
  Object.fromEntries(
    scopes.map((scope) => [
      toCamelCase(scope),
      new ScopedLogger([...parents, scope]),
    ]),
  ) as unknown as ScopedLoggers<T>;

/**
 * Loggers that prefix each message with their scopes.
 *
 * ```ts
 * const log = createLogger('ng', 'server');
 * log.ng.log('starting'); // [ng] starting
 * const ng = log.ng.create('router', 'app engine');
 * ng.appEngine.log('start'); // [ng][app engine] start
 * ```
 */
export const createLogger = <const T extends readonly string[]>(
  ...scopes: T
) => createScoped([], scopes);
