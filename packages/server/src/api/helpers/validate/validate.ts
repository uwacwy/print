import type { ApiError } from '@uwacwy/print-shared';

import { z } from 'zod';

export type ParsedRequest<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType
    ? z.output<S[K]>
    : never;
};

export interface RequestSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

/** Parses each part the schemas name; the first failure becomes an `ApiError`. */
export const parseRequest = <S extends RequestSchemas>(
  schemas: S,
  request: { body: unknown; params: unknown; query: unknown },
): { data: ParsedRequest<S> } | { error: ApiError } => {
  const data: Record<string, unknown> = {};
  for (const part of ['params', 'query', 'body'] as const) {
    const schema = schemas[part];
    if (!schema) {
      continue;
    }
    const result = schema.safeParse(request[part]);
    if (!result.success) {
      return {
        error: {
          code: 'invalid_request',
          error: `Invalid ${part}.\n${z.prettifyError(result.error)}`,
          issues: z.treeifyError(result.error),
        },
      };
    }
    data[part] = result.data;
  }
  return { data: data as ParsedRequest<S> };
};
