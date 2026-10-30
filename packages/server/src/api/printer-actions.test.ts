import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { JWTPayload } from 'jose';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntraAccessTokenVerifier } from './admin-auth';
import apiRoot from './index';
import {
  createPrinter,
  getPrinterByToken,
  openDatabase,
  type PrintDatabase,
} from '../lib/database/database.js';
import { enqueueJob } from '../lib/jobs.js';
import { inspectUploadToken, verifyUploadToken } from '../lib/upload-token/upload-token.js';
import { AgentHub } from '../realtime/agent-hub';
import { testUploadConfig } from '../realtime/test-support';

describe('admin printer actions', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let dataDir: string;
  let db: PrintDatabase;
  let jobsDir: string;
  let printerId: number;
  let agentToken: string;

  const verifyAccessToken: EntraAccessTokenVerifier = async (token) => {
    if (token === 'invalid') throw new Error('invalid token');
    if (token === 'admin-role') {
      return {
        sub: 'role-admin',
        roles: ['PrintAdmin'],
        scp: 'Printers.Manage',
      } as JWTPayload;
    }
    if (token === 'admin-group') {
      return {
        sub: 'group-admin',
        groups: ['admin-group-id'],
        scp: 'Printers.Manage',
      } as JWTPayload;
    }
    if (token === 'wrong-scope') {
      return { sub: 'scope-user', scp: 'User.Read' } as JWTPayload;
    }
    return { sub: 'ordinary-user', scp: 'Printers.Manage' } as JWTPayload;
  };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'omega-print-api-'));
    const database = openDatabase(dataDir);
    db = database.db;
    jobsDir = database.jobsDir;
    const created = createPrinter(db, {
      slug: 'front-office',
      name: 'Front Office',
      queue: 'Front_Office',
      cover_page: false,
    });
    if (typeof created === 'string') throw new Error(created);
    printerId = created.id;
    agentToken = created.token;
    const hub = new AgentHub(db);
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      apiRoot({
        db,
        jobsDir: database.jobsDir,
        getHub: () => hub,
        upload: testUploadConfig,
        adminAuth: {
          tenantId: '123e4567-e89b-12d3-a456-426614174000',
          audience: 'api://print-api',
          adminRole: 'PrintAdmin',
          adminGroupIds: ['admin-group-id'],
        },
        verifyAccessToken,
      }),
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    db.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const admin = { authorization: ['Bear', 'er admin-role'].join('') };
  const jobCount = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE printer_id = ?').get(printerId) as { n: number }).n;

  it('requires admin auth and 404s unknown printers', async () => {
    const anonymous = await fetch(`${baseUrl}/api/admin/printers/${printerId}/qr.pdf`);
    expect(anonymous.status).toBe(401);
    for (const [method, path] of [
      ['GET', 'qr.pdf'],
      ['POST', 'qr.pdf'],
      ['POST', 'qr-print'],
      ['POST', 'qr-token'],
      ['POST', 'qr-epoch'],
      ['POST', 'pin'],
      ['DELETE', 'pin'],
      ['POST', 'token'],
      ['DELETE', 'jobs'],
    ]) {
      const response = await fetch(`${baseUrl}/api/admin/printers/9999/${path}`, {
        method,
        headers: admin,
      });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it('renders the QR poster PDF', async () => {
    const response = await fetch(`${baseUrl}/api/admin/printers/${printerId}/qr.pdf`, {
      headers: admin,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  const post = (path: string, body?: unknown, method: 'POST' | 'DELETE' = 'POST') =>
    fetch(`${baseUrl}/api/admin/printers/${printerId}/${path}`, {
      method,
      headers: { ...admin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const printer = () =>
    db.prepare('SELECT id, slug, qr_epoch FROM printers WHERE id = ?').get(printerId) as {
      id: number;
      slug: string;
      qr_epoch: number;
    };

  it('issues a QR upload token with a print-page link for the requested window', async () => {
    const notBefore = new Date(Date.now() + 3_600_000);
    const expiresAt = new Date(Date.now() + 5 * 3_600_000);
    const response = await post('qr-token', {
      notBefore: notBefore.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      token: string;
      path: string;
      url: string;
      notBefore: string;
      expiresAt: string;
    };
    expect(body.path).toBe(`/print/front-office?token=${body.token}`);
    expect(body.url).toBe(`${baseUrl}${body.path}`);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{42}$/);
    expect(inspectUploadToken(testUploadConfig.access, body.token)).toEqual({
      source: 'qr',
      printerId,
      epoch: 0,
      notBefore: new Date(Math.floor(notBefore.getTime() / 60_000) * 60_000),
      expiresAt: new Date(Math.ceil(expiresAt.getTime() / 60_000) * 60_000),
    });

    const defaults = (await (await post('qr-token', {})).json()) as { notBefore: string; expiresAt: string };
    // Tokens store whole minutes, so the window is rounded outward by up to a minute.
    const window = Date.parse(defaults.expiresAt) - Date.parse(defaults.notBefore);
    expect(window).toBeGreaterThanOrEqual(24 * 3_600_000);
    expect(window).toBeLessThanOrEqual(24 * 3_600_000 + 60_000);

    const backwards = await post('qr-token', {
      notBefore: expiresAt.toISOString(),
      expiresAt: notBefore.toISOString(),
    });
    expect(backwards.status).toBe(400);
  });

  it('renders the poster for an already-issued token and rejects foreign ones', async () => {
    const { token } = (await (await post('qr-token', {})).json()) as { token: string };
    const poster = await post('qr.pdf', { token });
    expect(poster.status).toBe(200);
    expect(poster.headers.get('content-type')).toBe('application/pdf');
    expect((await post('qr.pdf', { token: 'not.a.token' })).status).toBe(400);
  });

  it('revokes outstanding QR tokens by bumping the epoch', async () => {
    const { token } = (await (await post('qr-token', {})).json()) as { token: string };
    const key = testUploadConfig.access;
    expect((await verifyUploadToken(key, printer(), token)).status).toBe('valid');

    const response = await post('qr-epoch');
    expect(response.status).toBe(200);
    expect(((await response.json()) as { qrEpoch: number }).qrEpoch).toBe(1);
    expect((await verifyUploadToken(key, printer(), token)).status).toBe('invalid');
    expect((await post('qr.pdf', { token })).status).toBe(400);
  });

  it('refreshes and disables the upload PIN', async () => {
    const refreshed = (await (await post('pin')).json()) as { pin: string };
    expect(refreshed.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
    const again = (await (await post('pin')).json()) as { pin: string };
    expect(again.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);

    const disabled = (await (await post('pin', undefined, 'DELETE')).json()) as { pin: string | null };
    expect(disabled.pin).toBeNull();
    const row = db.prepare('SELECT pin FROM printers WHERE id = ?').get(printerId) as { pin: null };
    expect(row.pin).toBeNull();
  });

  it('queues the QR sheet as a print job', async () => {
    const response = await fetch(`${baseUrl}/api/admin/printers/${printerId}/qr-print`, {
      method: 'POST',
      headers: admin,
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { jobId: string; agentOnline: boolean };
    expect(body.agentOnline).toBe(false);
    const job = db.prepare('SELECT status, title FROM jobs WHERE id = ?').get(body.jobId);
    expect(job).toEqual({ status: 'queued', title: 'QR info sheet - Front Office' });
    expect(existsSync(join(jobsDir, `${body.jobId}.pdf`))).toBe(true);
  });

  it('rotates the agent token', async () => {
    const response = await fetch(`${baseUrl}/api/admin/printers/${printerId}/token`, {
      method: 'POST',
      headers: admin,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { agentToken: string; printer: { id: number } };
    expect(body.printer.id).toBe(printerId);
    expect(body.agentToken).not.toBe(agentToken);
    expect(getPrinterByToken(db, agentToken)).toBeUndefined();
    expect(getPrinterByToken(db, body.agentToken)?.id).toBe(printerId);
  });

  it('deletes every job and its file for one printer', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4');
    const job = {
      printerId,
      title: 'Return',
      copies: 1,
      originalName: 'return.pdf',
      submittedBy: null,
      uploaderIp: '127.0.0.1',
    };
    const ids = [await enqueueJob(db, jobsDir, job, pdf), await enqueueJob(db, jobsDir, job, pdf)];
    expect(jobCount()).toBe(2);

    const response = await fetch(`${baseUrl}/api/admin/printers/${printerId}/jobs`, {
      method: 'DELETE',
      headers: admin,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { deleted: number; printer: { activeJobs: number } };
    expect(body.deleted).toBe(2);
    expect(body.printer.activeJobs).toBe(0);
    expect(jobCount()).toBe(0);
    for (const id of ids) expect(existsSync(join(jobsDir, `${id}.pdf`))).toBe(false);
  });
});
