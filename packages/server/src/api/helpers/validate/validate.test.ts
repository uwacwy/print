import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseRequest } from './validate';

const schemas = {
  body: z.object({ queue: z.string() }),
  params: z.object({ id: z.uuid() }),
};
const id = '0b5f3a52-6d0a-4c0e-9f0c-2c3f4a5b6c7d';

describe('parseRequest', () => {
  it('returns parsed parts', () => {
    expect(
      parseRequest(schemas, {
        body: { queue: 'q' },
        params: { id },
        query: {},
      }),
    ).toEqual({
      data: { body: { queue: 'q' }, params: { id } },
    });
  });

  it('names the failing part and fields', () => {
    expect(
      parseRequest(schemas, {
        body: { queue: 1 },
        params: { id },
        query: {},
      }),
    ).toEqual({
      error: {
        code: 'invalid_request',
        error: expect.stringContaining('Invalid body.'),
        issues: {
          errors: [],
          properties: {
            queue: { errors: [expect.any(String)] },
          },
        },
      },
    });
  });

  it('checks params before the body', () => {
    const result = parseRequest(schemas, {
      body: {},
      params: { id: 'nope' },
      query: {},
    });
    expect(result).toMatchObject({
      error: {
        error: expect.stringContaining('Invalid params.'),
      },
    });
  });

  it('skips parts without a schema', () => {
    expect(
      parseRequest({}, { body: 1, params: 1, query: 1 }),
    ).toEqual({ data: {} });
  });
});
