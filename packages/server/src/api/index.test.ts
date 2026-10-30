import { beforeEach, describe, expect, it } from 'vitest';
import { useApiServer } from './test-support';

describe('API root', () => {
  const api = useApiServer();
  beforeEach(() => api.start());

  it('keeps health public, protects management routes, and has no /admin prefix', async () => {
    expect((await fetch(`${api.baseUrl}/api/healthz`)).status).toBe(
      200,
    );
    expect((await fetch(`${api.baseUrl}/api/printers`)).status).toBe(
      401,
    );
    expect(
      (await fetch(`${api.baseUrl}/api/admin/session`)).status,
    ).toBe(404);
  });
});
