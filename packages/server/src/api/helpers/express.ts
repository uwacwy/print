import type { RequestHandler } from 'express';

/**
 * Tries each middleware in order stopping when the first one calls next(). Lazy;
 * middleware are tried until one succeeds. Stops calling middleware when the first succeeds.
 *
 * @param middlewares Middleware to try, in order
 * @returns A middleware that tries each in order
 */
export const any =
  (middlewares: RequestHandler[]): RequestHandler =>
  (req, res, next) => {
    let running = true;
    const n = (...args: unknown[]) => {
      running = false;
      next(...args);
    };
    for (const m of middlewares) {
      if (!running) break;
      m(req, res, n);
    }
  };
