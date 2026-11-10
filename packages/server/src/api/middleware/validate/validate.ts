/*
 * The typed-handler approach (a middleware typed as
 * `RequestHandler<Params, ResBody, Body, Query>` so the handlers after it see
 * parsed types) is adapted from zod-express-middleware by Casper Schouls
 * (https://github.com/Aquila169/zod-express-middleware), MIT License,
 * Copyright (c) 2021 Casper Schouls. That library targets Express 4 and zod 3,
 * so it is ported here for Express 5 and zod 4.
 */
import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import type { z } from 'zod';

import { parseRequest } from '../../helpers/validate/validate';

/** Writes onto `request` even where Express 5 exposes a read-only getter (`req.query`). */
const assign = (
  request: object,
  key: 'body' | 'params' | 'query',
  value: unknown,
) =>
  Object.defineProperty(request, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });

/**
 * Validates `req.params`, `req.query` and `req.body`, answering 400 with the
 * zod issues when they do not match. The parsed values replace the originals,
 * and the handlers after it are typed from the schemas.
 */
export const validate =
  <
    TParams = ParamsDictionary,
    TQuery = ParsedQs,
    TBody = unknown,
  >(schemas: {
    body?: z.ZodType<TBody>;
    params?: z.ZodType<TParams>;
    query?: z.ZodType<TQuery>;
  }): RequestHandler<TParams, unknown, TBody, TQuery> =>
  (request, response, next) => {
    const parsed = parseRequest(schemas, request);
    if ('error' in parsed) {
      response.status(400).json(parsed.error);
      return;
    }
    for (const [key, value] of Object.entries(parsed.data)) {
      assign(request, key as 'body', value);
    }
    next();
  };
