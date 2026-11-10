import type { Request, Response } from 'express';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { validate } from './validate';

const run = (
  request: object,
  schemas: Parameters<typeof validate>[0],
) => {
  const json = vi.fn();
  const response = {
    json,
    status: vi.fn().mockReturnValue({ json }),
  } as unknown as Response;
  const next = vi.fn();
  validate(schemas)(request as Request, response, next);
  return { json, next, response };
};

describe('validate middleware', () => {
  it('replaces body, params and a read-only query with the parsed values', () => {
    const proto = {};
    Object.defineProperty(proto, 'query', {
      configurable: true,
      get: () => ({ page: '3' }),
    });
    const request = Object.assign(Object.create(proto), {
      body: { count: '2' },
      params: { id: 'a' },
    });
    const { next } = run(request, {
      body: z.object({ count: z.coerce.number() }),
      query: z.object({ page: z.coerce.number() }),
    });
    expect(next).toHaveBeenCalledOnce();
    expect(request).toMatchObject({
      body: { count: 2 },
      params: { id: 'a' },
      query: { page: 3 },
    });
  });

  it('answers 400 with the issues and stops', () => {
    const { json, next, response } = run(
      { body: { count: 'x' }, params: {}, query: {} },
      { body: z.object({ count: z.number() }) },
    );
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid_request' }),
    );
  });
});
