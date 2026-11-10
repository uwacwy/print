import type { z } from 'zod';

/** A parser for incoming data; throws a `ZodError` that names the failing fields. */
export const parseWith =
  <S extends z.ZodType>(schema: S) =>
  (data: unknown): z.output<S> =>
    schema.parse(data);
