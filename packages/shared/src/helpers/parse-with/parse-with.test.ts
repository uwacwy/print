import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseWith } from './parse-with';

describe('parseWith', () => {
  const parse = parseWith(z.object({ n: z.number() }));

  it('returns the typed value', () => {
    expect(parse({ n: 1 })).toEqual({ n: 1 });
  });

  it('throws on invalid data', () => {
    expect(() => parse({ n: 'x' })).toThrow(z.ZodError);
  });
});
