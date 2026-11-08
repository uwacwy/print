const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

export const isLoopbackHost = (hostname: string): boolean =>
  LOOPBACK_HOSTS.has(hostname) ||
  hostname.endsWith('.localhost') ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname);

/** Print servers must use HTTPS, except on loopback (dev) or when explicitly allowed. */
export const isAllowedServerUrl = (
  value: string,
  { insecure = false }: { insecure?: boolean } = {},
): boolean => {
  const url = parseUrl(value);
  return (
    !!url &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (insecure || isLoopbackHost(url.hostname))))
  );
};

/**
 * The origin agents and install commands use, from the server's `PUBLIC_URL`.
 * `undefined` when unset, unparsable, or not allowed by `isAllowedServerUrl`.
 */
export const serverOrigin = (
  publicUrl: string | undefined,
): string | undefined => {
  const url = publicUrl ? parseUrl(publicUrl) : undefined;
  return url && isAllowedServerUrl(url.href)
    ? url.origin
    : undefined;
};
