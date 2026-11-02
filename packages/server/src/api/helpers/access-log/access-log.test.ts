import express from 'express';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
} from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type AccessLogEntry,
  accessLogMiddleware,
  openAccessLog,
  redactUrl,
} from './access-log';

const serve = (app: express.Express) =>
  new Promise<{ url: string; close: () => Promise<void> }>(
    (resolve) => {
      const server = app.listen(0, '127.0.0.1', () =>
        resolve({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          close: () =>
            new Promise((done) => server.close(() => done())),
        }),
      );
    },
  );

const appWith = (middleware: express.RequestHandler) => {
  const app = express();
  app.use(middleware);
  app.get('/api/healthz', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.get('/print/:slug', (_request, response) => {
    response.type('html').send('<p>hello</p>');
  });
  app.get('/missing', (_request, response) => {
    response.sendStatus(404);
  });
  return app;
};

describe('redactUrl', () => {
  it('redacts credential query values and keeps everything else', () => {
    expect(redactUrl('/print/lobby?token=abc.def&copies=2')).toBe(
      '/print/lobby?token=REDACTED&copies=2',
    );
    expect(
      redactUrl(
        'https://print.example.org/auth/callback?code=x&state=y#frag',
      ),
    ).toBe(
      'https://print.example.org/auth/callback?code=REDACTED&state=y#frag',
    );
    expect(
      redactUrl('/a?TOKEN=1&%74oken=2&Pin=3&access_token=4'),
    ).toBe(
      '/a?TOKEN=REDACTED&%74oken=REDACTED&Pin=REDACTED&access_token=REDACTED',
    );
    expect(redactUrl('/api/status')).toBe('/api/status');
    expect(redactUrl('/a?flag&tokens=1')).toBe('/a?flag&tokens=1');
  });
});

describe('accessLogMiddleware', () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(() =>
    Promise.all(closers.splice(0).map((close) => close())),
  );

  it('logs each request with redacted URL and referrer, skipping health checks', async () => {
    const entries: AccessLogEntry[] = [];
    const server = await serve(
      appWith(
        accessLogMiddleware({
          info: (entry) => entries.push(entry),
        }),
      ),
    );
    closers.push(server.close);

    await fetch(`${server.url}/api/healthz`);
    await fetch(`${server.url}/print/lobby?token=secret-token`, {
      headers: {
        referer: `${server.url}/print/lobby?token=older-token`,
        'user-agent': 'vitest',
      },
    });
    await fetch(`${server.url}/missing`, { method: 'GET' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      ip: '127.0.0.1',
      method: 'GET',
      url: '/print/lobby?token=REDACTED',
      httpVersion: '1.1',
      status: 200,
      bytes: 12,
      referrer: `${server.url}/print/lobby?token=REDACTED`,
      userAgent: 'vitest',
    });
    expect(entries[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(entries[0]).not.toHaveProperty('aborted');
    expect(entries[1]).toMatchObject({
      url: '/missing',
      status: 404,
    });
    expect(JSON.stringify(entries)).not.toContain('secret-token');
    expect(JSON.stringify(entries)).not.toContain('older-token');
  });
});

describe('openAccessLog', () => {
  const dirs: string[] = [];
  afterEach(() =>
    dirs
      .splice(0)
      .forEach((dir) =>
        rmSync(dir, { recursive: true, force: true }),
      ),
  );

  it('writes JSON lines to a dated file behind the access.log symlink', async () => {
    const dir = join(
      mkdtempSync(join(tmpdir(), 'print-log-')),
      'logs',
    );
    dirs.push(join(dir, '..'));
    const accessLog = openAccessLog({ dir, maxDays: 3 });
    expect(openAccessLog({ dir, maxDays: 3 })).toBe(accessLog);

    const server = await serve(appWith(accessLog.middleware));
    await fetch(`${server.url}/print/lobby?token=secret-token`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await server.close();
    await accessLog.close();

    const link = join(dir, 'access.log');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toMatch(
      /^access-\d{4}-\d{2}-\d{2}\.log$/,
    );
    const lines = readFileSync(link, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'info',
      method: 'GET',
      url: '/print/lobby?token=REDACTED',
      status: 200,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(openAccessLog({ dir, maxDays: 3 })).not.toBe(accessLog);
    await openAccessLog({ dir, maxDays: 3 }).close();
  });
});
