import { $ } from '@uwacwy/print-shared';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPrinter,
  testEntra,
  testUploadConfig,
} from '../../../realtime/test-support';
import { getPrinterByToken } from '../../helpers/database/database';
import { enqueueJob } from '../../helpers/database/jobs';
import {
  inspectUploadToken,
  verifyUploadToken,
} from '../../middleware/auth/upload-token/upload-token';
import {
  testSiteUrl,
  uploadForm,
  useApiServer,
} from '../../test-support';

type PrinterAction =
  | 'agentToken'
  | 'jobs'
  | 'pin'
  | 'qrEpoch'
  | 'qrPdf'
  | 'qrPrint'
  | 'qrToken'
  | 'token';

describe('printers router', () => {
  const { bearer, entra } = testEntra({
    adminRole: 'PrintAdmin',
  });
  const api = useApiServer({ entra });
  const roleAdmin = () =>
    bearer({
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
      sub: 'role-admin',
    });
  const adminBearer = () =>
    bearer({
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
      sub: 'admin',
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
        `${api.baseUrl}${$.api.printers()}`,
        {
          body: JSON.stringify({
            coverPage: true,
            name: 'Front Office',
            queue: 'cups://Front_Office',
            slug: 'front-office',
          }),
          headers: json,
          method: 'POST',
        },
      );
      const created = await createdResponse.json();
      expect(createdResponse.status).toBe(201);
      expect(created.printer).toMatchObject({
        coverPage: true,
        name: 'Front Office',
        slug: 'front-office',
      });
      expect(created.agentToken).toBeTruthy();
      expect(created.printer).not.toHaveProperty('token');

      const publicResponse = await fetch(
        `${api.baseUrl}${$.api.printers.$slug({ slug: 'front-office' })}`,
      );
      expect(publicResponse.status).toBe(200);
      expect(await publicResponse.json()).toEqual({
        access: {
          pinEnabled: false,
          signedIn: false,
          token: null,
          tokenExpiresAt: null,
        },
        coverPage: true,
        name: 'Front Office',
        slug: 'front-office',
        upload: {
          maxCopies: testUploadConfig.maxCopies,
          maxDocuments: testUploadConfig.maxDocumentsPerJob,
          maxUploadBytes: testUploadConfig.maxUploadBytes,
        },
      });

      const managed = await fetch(
        `${api.baseUrl}${$.api.printers.$slug({ slug: 'front-office' })}`,
        { headers: { authorization } },
      );
      expect(await managed.json()).toMatchObject({
        access: { signedIn: true, token: null },
        id: created.printer.id,
        queue: 'cups://Front_Office',
      });

      const list = await (
        await fetch(`${api.baseUrl}${$.api.printers()}`, {
          headers: { authorization },
        })
      ).json();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        online: false,
        queue: 'cups://Front_Office',
      });

      const updateResponse = await fetch(
        `${api.baseUrl}${$.api.printers.$slug({ slug: 'front-office' })}`,
        {
          body: JSON.stringify({
            coverPage: false,
            name: 'Reception',
            queue: 'cups://Front_Office',
            slug: 'front-office',
          }),
          headers: json,
          method: 'PATCH',
        },
      );
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({
        coverPage: false,
        name: 'Reception',
      });

      const anonymousDelete = await fetch(
        `${api.baseUrl}${$.api.printers.$slug({ slug: 'front-office' })}`,
        { method: 'DELETE' },
      );
      expect(anonymousDelete.status).toBe(401);
      const deleteResponse = await fetch(
        `${api.baseUrl}${$.api.printers.$slug({ slug: 'front-office' })}`,
        {
          headers: { authorization },
          method: 'DELETE',
        },
      );
      expect(deleteResponse.status).toBe(204);
      expect(
        (
          await fetch(
            `${api.baseUrl}${$.api.printers.$slug({ slug: 'front-office' })}`,
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('management actions', () => {
    let printerId: number;
    let agentToken: string;
    let admin: { authorization: string };

    beforeEach(async () => {
      await api.start();
      ({ id: printerId, token: agentToken } = addPrinter(
        api.db,
      ));
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
      action: PrinterAction,
      body?: unknown,
      method: 'DELETE' | 'POST' = 'POST',
    ) =>
      fetch(
        `${api.baseUrl}${$.api.printers.$slug[action]({ slug: 'front-office' })}`,
        {
          body:
            body === undefined
              ? undefined
              : JSON.stringify(body),
          headers: {
            ...admin,
            'content-type': 'application/json',
          },
          method,
        },
      );
    const printer = () =>
      api.db
        .prepare(
          'SELECT id, slug, qr_epoch FROM printers WHERE id = ?',
        )
        .get(printerId) as {
        id: number;
        qr_epoch: number;
        slug: string;
      };

    it('requires admin auth and 404s unknown printers', async () => {
      const anonymous = await fetch(
        `${api.baseUrl}${$.api.printers.$slug.qrPdf({ slug: 'front-office' })}`,
      );
      expect(anonymous.status).toBe(401);
      const cases: [string, PrinterAction][] = [
        ['GET', 'qrPdf'],
        ['POST', 'qrPdf'],
        ['POST', 'qrPrint'],
        ['POST', 'qrToken'],
        ['POST', 'qrEpoch'],
        ['POST', 'pin'],
        ['DELETE', 'pin'],
        ['POST', 'agentToken'],
        ['DELETE', 'jobs'],
      ];
      for (const [method, path] of cases) {
        const response = await fetch(
          `${api.baseUrl}${$.api.printers.$slug[path]({ slug: 'missing' })}`,
          {
            headers: admin,
            method,
          },
        );
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    });

    it('renders the QR poster PDF', async () => {
      const response = await fetch(
        `${api.baseUrl}${$.api.printers.$slug.qrPdf({ slug: 'front-office' })}`,
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
      const response = await post('qrToken', {
        expiresAt: expiresAt.toISOString(),
        notBefore: notBefore.toISOString(),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        expiresAt: string;
        notBefore: string;
        path: string;
        token: string;
        url: string;
      };
      expect(body.path).toBe(
        `/print/front-office?token=${body.token}`,
      );
      expect(body.url).toBe(`${testSiteUrl.origin}${body.path}`);
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{42}$/);
      expect(
        inspectUploadToken(testUploadConfig.access, body.token),
      ).toEqual({
        epoch: 0,
        expiresAt: new Date(
          Math.ceil(expiresAt.getTime() / 60_000) * 60_000,
        ),
        notBefore: new Date(
          Math.floor(notBefore.getTime() / 60_000) * 60_000,
        ),
        printerId,
        source: 'qr',
      });

      const defaults = (await (
        await post('qrToken', {})
      ).json()) as {
        expiresAt: string;
        notBefore: string;
      };
      // Tokens store whole minutes, so the window is rounded outward by up to a minute.
      const window =
        Date.parse(defaults.expiresAt) -
        Date.parse(defaults.notBefore);
      expect(window).toBeGreaterThanOrEqual(24 * 3_600_000);
      expect(window).toBeLessThanOrEqual(
        24 * 3_600_000 + 60_000,
      );

      const backwards = await post('qrToken', {
        expiresAt: notBefore.toISOString(),
        notBefore: expiresAt.toISOString(),
      });
      expect(backwards.status).toBe(400);
    });

    it('renders the poster for an already-issued token and rejects foreign ones', async () => {
      const { token } = (await (
        await post('qrToken', {})
      ).json()) as { token: string };
      const poster = await post('qrPdf', { token });
      expect(poster.status).toBe(200);
      expect(poster.headers.get('content-type')).toBe(
        'application/pdf',
      );
      expect(
        (await post('qrPdf', { token: 'not.a.token' })).status,
      ).toBe(400);
    });

    it('revokes outstanding QR tokens by bumping the epoch', async () => {
      const { token } = (await (
        await post('qrToken', {})
      ).json()) as { token: string };
      const key = testUploadConfig.access;
      expect(
        (await verifyUploadToken(key, printer(), token)).status,
      ).toBe('valid');

      const response = await post('qrEpoch');
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { qrEpoch: number }).qrEpoch,
      ).toBe(1);
      expect(
        (await verifyUploadToken(key, printer(), token)).status,
      ).toBe('invalid');
      expect((await post('qrPdf', { token })).status).toBe(400);
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
      ).json()) as { pin: null | string };
      expect(disabled.pin).toBeNull();
      const row = api.db
        .prepare('SELECT pin FROM printers WHERE id = ?')
        .get(printerId) as { pin: null };
      expect(row.pin).toBeNull();
    });

    it('queues the QR sheet as a print job', async () => {
      const response = await fetch(
        `${api.baseUrl}${$.api.printers.$slug.qrPrint({ slug: 'front-office' })}`,
        {
          headers: admin,
          method: 'POST',
        },
      );
      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        agentOnline: boolean;
        jobId: string;
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
        `${api.baseUrl}${$.api.printers.$slug.agentToken({ slug: 'front-office' })}`,
        {
          headers: admin,
          method: 'POST',
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        agentToken: string;
        printer: { id: number };
      };
      expect(body.printer.id).toBe(printerId);
      expect(body.agentToken).not.toBe(agentToken);
      expect(
        getPrinterByToken(api.db, agentToken),
      ).toBeUndefined();
      expect(
        getPrinterByToken(api.db, body.agentToken)?.id,
      ).toBe(printerId);
    });

    it('deletes every job and its file for one printer', async () => {
      const pdf = new TextEncoder().encode('%PDF-1.4');
      const job = {
        copies: 1,
        originalName: 'return.pdf',
        printerId,
        submittedBy: null,
        title: 'Return',
        uploaderIp: '127.0.0.1',
      };
      const ids = [
        await enqueueJob(api.db, api.jobsDir, job, pdf),
        await enqueueJob(api.db, api.jobsDir, job, pdf),
      ];
      expect(jobCount()).toBe(2);

      const response = await fetch(
        `${api.baseUrl}${$.api.printers.$slug.jobs({ slug: 'front-office' })}`,
        {
          headers: admin,
          method: 'DELETE',
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

    it('requeues failed jobs that still have their document', async () => {
      const pdf = new TextEncoder().encode('%PDF-1.4');
      const job = {
        copies: 1,
        originalName: 'return.pdf',
        printerId,
        submittedBy: null,
        title: 'Return',
        uploaderIp: '127.0.0.1',
      };
      const [kept, gone, queued] = [
        await enqueueJob(api.db, api.jobsDir, job, pdf),
        await enqueueJob(api.db, api.jobsDir, job, pdf),
        await enqueueJob(api.db, api.jobsDir, job, pdf),
      ];
      api.db
        .prepare(
          "UPDATE jobs SET status = 'failed', error = 'jammed', finished_at = 'now' WHERE id IN (?, ?)",
        )
        .run(kept, gone);
      rmSync(join(api.jobsDir, `${gone}.pdf`));
      const status = (id: string) =>
        api.db
          .prepare('SELECT status, error FROM jobs WHERE id = ?')
          .get(id) as { error: null | string; status: string };

      const list = (await (
        await fetch(`${api.baseUrl}${$.api.printers()}`, {
          headers: admin,
        })
      ).json()) as { failedJobs: number }[];
      expect(list[0].failedJobs).toBe(2);

      const retry = () =>
        fetch(
          `${api.baseUrl}${$.api.printers.$slug.jobs.retry({ slug: 'front-office' })}`,
          {
            headers: admin,
            method: 'POST',
          },
        );
      expect(
        (
          await fetch(
            `${api.baseUrl}${$.api.printers.$slug.jobs.retry({ slug: 'front-office' })}`,
            { method: 'POST' },
          )
        ).status,
      ).toBe(401);

      const response = await retry();
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        printer: { activeJobs: number; failedJobs: number };
        retried: number;
      };
      expect(body.retried).toBe(1);
      expect(body.printer).toMatchObject({
        activeJobs: 2,
        failedJobs: 0,
      });
      expect(status(kept)).toEqual({
        error: null,
        status: 'queued',
      });
      expect(status(gone)).toEqual({
        error: 'jammed',
        status: 'expired',
      });
      expect(status(queued).status).toBe('queued');
    });
  });

  describe('job uploads', () => {
    it('queues uploads while the agent is offline and delivers them on connect', async () => {
      await api.start();
      const { token } = addPrinter(api.db);

      const response = await api.postUpload(await uploadForm());
      expect(response.status).toBe(201);
      const { agentOnline, jobId } = (await response.json()) as {
        agentOnline: boolean;
        jobId: string;
      };
      expect(agentOnline).toBe(false);

      const agent = await api.connectAgent(token);
      await expect(agent.next()).resolves.toEqual({
        jobs: [{ id: jobId, title: 'intake' }],
        type: 'jobs',
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
      const { jobId } = (await response.json()) as {
        jobId: string;
      };
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
