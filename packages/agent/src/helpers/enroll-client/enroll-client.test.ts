import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  enroll,
  queueForReport,
  reportQueue,
  ServerError,
  serverError,
} from './enroll-client';

describe('enroll-client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('strips driver options and credentials from the reported queue', () => {
    expect(
      queueForReport('cups://Front_Desk?option_sides=one-sided'),
    ).toBe('cups://Front_Desk');
    expect(
      queueForReport(
        'ipps://u:p@printer.local/ipp/print?quality=high#x',
      ),
    ).toBe('ipps://printer.local/ipp/print');
  });

  it('builds errors from API bodies', () => {
    expect(
      serverError(409, { code: 'slug_taken', error: 'Taken.' }),
    ).toEqual(
      expect.objectContaining({
        code: 'slug_taken',
        message: 'Taken.',
        status: 409,
      }),
    );
    expect(serverError(502, '<html>').message).toBe(
      'The print server answered 502.',
    );
  });

  it('posts enrollment with the token and cleaned queue', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          agentToken: 't',
          printer: { name: 'n', queue: 'cups://Q', slug: 's' },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      enroll('https://print.example.org/', 'enroll-token', {
        name: 'n',
        queue: 'cups://Q?option_x=1',
        slug: 's',
      }),
    ).resolves.toMatchObject({ agentToken: 't' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.href).toBe(
      'https://print.example.org/api/agent/enroll',
    );
    expect(init.method).toBe('POST');
    expect(
      (init.headers as Record<string, string>)['authorization'],
    ).toBe('Bearer enroll-token');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'n',
      queue: 'cups://Q',
      slug: 's',
    });
  });

  it('rejects with ServerError or a reachability message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { code: 'agent_token_invalid', error: 'Bad token.' },
          { status: 401 },
        ),
      ),
    );
    const rejected = reportQueue(
      'https://p.example.org',
      't',
      'cups://Q',
    );
    await expect(rejected).rejects.toBeInstanceOf(ServerError);
    await expect(rejected).rejects.toMatchObject({
      status: 401,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed', {
          cause: new Error(
            'getaddrinfo ENOTFOUND p.example.org',
          ),
        });
      }),
    );
    await expect(
      reportQueue('https://p.example.org', 't', 'cups://Q'),
    ).rejects.toThrow(
      'Could not reach https://p.example.org: getaddrinfo ENOTFOUND p.example.org',
    );
  });
});
