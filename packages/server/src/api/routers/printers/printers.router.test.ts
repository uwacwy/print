import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  inspectUploadToken,
  verifyUploadToken,
} from '../../middleware/auth/upload-token/upload-token';
import {
  addPrinter,
  testEntra,
  testUploadConfig,
} from '../../../realtime/test-support';
import { uploadForm, useApiServer } from '../../test-support';
import { getPrinterByToken } from '../../helpers/database/database';
import { enqueueJob } from '../../helpers/database/jobs';

describe('printers router', () => {
  const { entra, bearer } = testEntra({ adminRole: 'PrintAdmin' });
  const api = useApiServer({ entra });
  const roleAdmin = () =>
    bearer({
      sub: 'role-admin',
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
    });
  const adminBearer = () =>
    bearer({
      sub: 'admin',
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
    });

  describe('printer CRUD', () => {
    beforeEach(() => api.start());

    it('creates, lists, exposes safe public details, updates, and deletes printers by slug', async () => {
      const authorization = await roleAdmin();
      const json = {
        authorization,
        'content-type': 'application/json',
      };
      const createdResponse = await fetch(
        `${api.baseUrl}/api/printers`,
        {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            slug: 'front-office',
            name: 'Front Office',
            queue: 'cups://Front_Office',
            coverPage: true,
          }),
        },
      );
      const created = await createdResponse.json();
      expect(createdResponse.status).toBe(201);
      expect(created.printer).toMatchObject({
        slug: 'front-office',
        name: 'Front Office',
        coverPage: true,
      });
      expect(created.agentToken).toBeTruthy();
      expect(created.printer).not.toHaveProperty('token');

      const publicResponse = await fetch(
        `${api.baseUrl}/api/printers/front-office`,
      );
      expect(publicResponse.status).toBe(200);
      expect(await publicResponse.json()).toEqual({
        slug: 'front-office',
        name: 'Front Office',
        coverPage: true,
        access: {
          pinEnabled: false,
          token: null,
          tokenExpiresAt: null,
        },
        upload: {
          maxDocuments: testUploadConfig.maxDocumentsPerJob,
          maxCopies: testUploadConfig.maxCopies,
          maxUploadBytes: testUploadConfig.maxUploadBytes,
        },
      });

      const managed = await fetch(
        `${api.baseUrl}/api/printers/front-office`,
        { headers: { authorization } },
      );
      expect(await managed.json()).toMatchObject({
        id: created.printer.id,
        queue: 'cups://Front_Office',
        access: { token: null },
      });

      const list = await (
        await fetch(`${api.baseUrl}/api/printers`, {
          headers: { authorization },
        })
      ).json();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        queue: 'cups://Front_Office',
        online: false,
      });

      const updateResponse = await fetch(
        `${api.baseUrl}/api/printers/front-office`,
        {
          method: 'PATCH',
          headers: json,
          body: JSON.stringify({
            slug: 'front-office',
            name: 'Reception',
            queue: 'cups://Front_Office',
            coverPage: false,
          }),
        },
      );
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({
        name: 'Reception',
        coverPage: false,
      });

      const anonymousDelete = await fetch(
        `${api.baseUrl}/api/printers/front-office`,
        { method: 'DELETE' },
      );
      expect(anonymousDelete.status).toBe(401);
      const deleteResponse = await fetch(
        `${api.baseUrl}/api/printers/front-office`,
        {
          method: 'DELETE',
          headers: { authorization },
        },
      );
      expect(deleteResponse.status).toBe(204);
      expect(
        (await fetch(`${api.baseUrl}/api/printers/front-office`))
          .status,
      ).toBe(404);
    });
  });

  describe('management actions', () => {
    let printerId: number;
    let agentToken: string;
    let admin: { authorization: string };

    beforeEach(async () => {
      await api.start();
      ({ id: printerId, token: agentToken } = addPrinter(api.db));
      admin = { authorization: await roleAdmin() };
    });

    const jobCount = () =>
      (
        api.db
          .prepare(
            'SELECT COUNT(*) AS n FROM jobs WHERE printer_id = ?',
          )
          .get(printerId) as { n: number }
      ).n;

    const post = (
      path: string,
      body?: unknown,
      method: 'POST' | 'DELETE' = 'POST',
    ) =>
      fetch(`${api.baseUrl}/api/printers/front-office/${path}`, {
        method,
        headers: { ...admin, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const printer = () =>
      api.db
        .prepare(
          'SELECT id, slug, qr_epoch FROM printers WHERE id = ?',
        )
        .get(printerId) as {
        id: number;
        slug: string;
        qr_epoch: number;
      };

    it('requires admin auth and 404s unknown printers', async () => {
      const anonymous = await fetch(
        `${api.baseUrl}/api/printers/front-office/qr.pdf`,
      );
      expect(anonymous.status).toBe(401);
      for (const [method, path] of [
        ['GET', 'qr.pdf'],
        ['POST', 'qr.pdf'],
        ['POST', 'qr-print'],
        ['POST', 'qr-token'],
        ['POST', 'qr-epoch'],
        ['POST', 'pin'],
        ['DELETE', 'pin'],
        ['POST', 'agent-token'],
        ['DELETE', 'jobs'],
      ]) {
        const response = await fetch(
          `${api.baseUrl}/api/printers/missing/${path}`,
          {
            method,
            headers: admin,
          },
        );
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    });

    it('renders the QR poster PDF', async () => {
      const response = await fetch(
        `${api.baseUrl}/api/printers/front-office/qr.pdf`,
        {
          headers: admin,
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        'application/pdf',
      );
      expect(response.headers.get('cache-control')).toContain(
        'no-store',
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe(
        '%PDF-',
      );
    });

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
      expect(body.path).toBe(
        `/print/front-office?token=${body.token}`,
      );
      expect(body.url).toBe(`${api.baseUrl}${body.path}`);
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{42}$/);
      expect(
        inspectUploadToken(testUploadConfig.access, body.token),
      ).toEqual({
        source: 'qr',
        printerId,
        epoch: 0,
        notBefore: new Date(
          Math.floor(notBefore.getTime() / 60_000) * 60_000,
        ),
        expiresAt: new Date(
          Math.ceil(expiresAt.getTime() / 60_000) * 60_000,
        ),
      });

      const defaults = (await (
        await post('qr-token', {})
      ).json()) as {
        notBefore: string;
        expiresAt: string;
      };
      // Tokens store whole minutes, so the window is rounded outward by up to a minute.
      const window =
        Date.parse(defaults.expiresAt) -
        Date.parse(defaults.notBefore);
      expect(window).toBeGreaterThanOrEqual(24 * 3_600_000);
      expect(window).toBeLessThanOrEqual(24 * 3_600_000 + 60_000);

      const backwards = await post('qr-token', {
        notBefore: expiresAt.toISOString(),
        expiresAt: notBefore.toISOString(),
      });
      expect(backwards.status).toBe(400);
    });

    it('renders the poster for an already-issued token and rejects foreign ones', async () => {
      const { token } = (await (
        await post('qr-token', {})
      ).json()) as { token: string };
      const poster = await post('qr.pdf', { token });
      expect(poster.status).toBe(200);
      expect(poster.headers.get('content-type')).toBe(
        'application/pdf',
      );
      expect(
        (await post('qr.pdf', { token: 'not.a.token' })).status,
      ).toBe(400);
    });

    it('revokes outstanding QR tokens by bumping the epoch', async () => {
      const { token } = (await (
        await post('qr-token', {})
      ).json()) as { token: string };
      const key = testUploadConfig.access;
      expect(
        (await verifyUploadToken(key, printer(), token)).status,
      ).toBe('valid');

      const response = await post('qr-epoch');
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { qrEpoch: number }).qrEpoch,
      ).toBe(1);
      expect(
        (await verifyUploadToken(key, printer(), token)).status,
      ).toBe('invalid');
      expect((await post('qr.pdf', { token })).status).toBe(400);
    });

    it('refreshes and disables the upload PIN', async () => {
      const refreshed = (await (await post('pin')).json()) as {
        pin: string;
      };
      expect(refreshed.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
      const again = (await (await post('pin')).json()) as {
        pin: string;
      };
      expect(again.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);

      const disabled = (await (
        await post('pin', undefined, 'DELETE')
      ).json()) as { pin: string | null };
      expect(disabled.pin).toBeNull();
      const row = api.db
        .prepare('SELECT pin FROM printers WHERE id = ?')
        .get(printerId) as { pin: null };
      expect(row.pin).toBeNull();
    });

    it('queues the QR sheet as a print job', async () => {
      const response = await fetch(
        `${api.baseUrl}/api/printers/front-office/qr-print`,
        {
          method: 'POST',
          headers: admin,
        },
      );
      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        jobId: string;
        agentOnline: boolean;
      };
      expect(body.agentOnline).toBe(false);
      const job = api.db
        .prepare('SELECT status, title FROM jobs WHERE id = ?')
        .get(body.jobId);
      expect(job).toEqual({
        status: 'queued',
        title: 'QR info sheet - Front Office',
      });
      expect(
        existsSync(join(api.jobsDir, `${body.jobId}.pdf`)),
      ).toBe(true);
    });

    it('rotates the agent token', async () => {
      const response = await fetch(
        `${api.baseUrl}/api/printers/front-office/agent-token`,
        {
          method: 'POST',
          headers: admin,
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        agentToken: string;
        printer: { id: number };
      };
      expect(body.printer.id).toBe(printerId);
      expect(body.agentToken).not.toBe(agentToken);
      expect(getPrinterByToken(api.db, agentToken)).toBeUndefined();
      expect(getPrinterByToken(api.db, body.agentToken)?.id).toBe(
        printerId,
      );
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
      const ids = [
        await enqueueJob(api.db, api.jobsDir, job, pdf),
        await enqueueJob(api.db, api.jobsDir, job, pdf),
      ];
      expect(jobCount()).toBe(2);

      const response = await fetch(
        `${api.baseUrl}/api/printers/front-office/jobs`,
        {
          method: 'DELETE',
          headers: admin,
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        deleted: number;
        printer: { activeJobs: number };
      };
      expect(body.deleted).toBe(2);
      expect(body.printer.activeJobs).toBe(0);
      expect(jobCount()).toBe(0);
      for (const id of ids) {
        expect(existsSync(join(api.jobsDir, `${id}.pdf`))).toBe(
          false,
        );
      }
    });
  });

  describe('job uploads', () => {
    it('queues uploads while the agent is offline and delivers them on connect', async () => {
      await api.start();
      const { token } = addPrinter(api.db);

      const response = await api.postUpload(await uploadForm());
      expect(response.status).toBe(201);
      const { jobId, agentOnline } = (await response.json()) as {
        jobId: string;
        agentOnline: boolean;
      };
      expect(agentOnline).toBe(false);

      const agent = await api.connectAgent(token);
      await expect(agent.next()).resolves.toEqual({
        type: 'jobs',
        jobs: [{ id: jobId, title: 'intake' }],
      });
    });

    it('lets a signed-in manager upload without a token or PIN', async () => {
      await api.start();
      addPrinter(api.db);
      const response = await api.postUpload(
        await uploadForm(),
        undefined,
        await adminBearer(),
      );
      expect(response.status).toBe(201);
      const { jobId } = (await response.json()) as { jobId: string };
      expect(
        api.db
          .prepare('SELECT submitted_by FROM jobs WHERE id = ?')
          .get(jobId),
      ).toEqual({
        submitted_by: 'entra:admin',
      });
    });

    it('rejects oversized files and invalid copy counts', async () => {
      await api.start({
        upload: { ...testUploadConfig, maxUploadBytes: 100 },
      });
      addPrinter(api.db);
      const tooBig = await api.postUpload(await uploadForm());
      expect(tooBig.status).toBe(413);

      await api.start();
      const badCopies = await api.postUpload(
        await uploadForm({ document__copies_0: '9' }),
      );
      expect(badCopies.status).toBe(400);
    });
  });
});
