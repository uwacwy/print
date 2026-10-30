import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_WS_PATH, agentJobFilePath, agentJobStatusPath } from '@uwacwy/print-shared';
import {
  getPrinterBySlug,
  getPrinterByToken,
  setPrinterPin,
  type PrintDatabase,
} from '../lib/database/database.js';
import { signUploadToken } from '../lib/upload-token/upload-token.js';
import { attachAgentGateway } from '../realtime/agent-gateway';
import { AgentHub } from '../realtime/agent-hub';
import {
  addPrinter,
  closeServer,
  listen,
  tempDatabase,
  testUploadConfig,
  TestAgent,
} from '../realtime/test-support';
import type { UploadConfig } from '../server-config';
import agentRouter from './agent.router';
import apiRoot from './index';

async function samplePdf(): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}

async function uploadForm(fields: Record<string, string> = {}): Promise<FormData> {
  const form = new FormData();
  form.set('document__file_0', await samplePdf(), 'intake.pdf');
  form.set('document__copies_0', '1');
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

/** Reads SSE frames from a fetch response body. */
async function* sseEvents(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (data) yield JSON.parse(data) as { type: string; [key: string]: unknown };
    }
  }
}

describe('realtime print flow over HTTP and WebSocket', () => {
  let db: PrintDatabase;
  let jobsDir: string;
  let cleanup: () => Promise<void>;
  let hub: AgentHub;
  let server: Server;
  let host: string;
  let agents: TestAgent[];
  let upload: UploadConfig;

  const start = async (uploadConfig: UploadConfig = testUploadConfig) => {
    upload = uploadConfig;
    const app = express();
    app.use(express.json());
    app.use('/agent', agentRouter({ db, jobsDir, getHub: () => hub }));
    app.use(
      '/api',
      apiRoot({
        db,
        jobsDir,
        getHub: () => hub,
        upload,
        adminAuth: { tenantId: 'tenant', audience: 'api://print', adminGroupIds: [] },
        verifyAccessToken: async () => ({ sub: 'admin', scp: 'Printers.Manage' }),
      }),
    );
    server = createServer(app);
    attachAgentGateway(server, {
      getHub: () => hub,
      authenticate: (token) => getPrinterByToken(db, token),
      rejectUnknownPaths: true,
    });
    host = await listen(server);
  };

  const connectAgent = async (token: string) => {
    const agent = new TestAgent(`ws://${host}${AGENT_WS_PATH}`, token);
    agents.push(agent);
    await expect(agent.next()).resolves.toMatchObject({ type: 'hello' });
    return agent;
  };

  const uploadToken = async (slug = 'front-office', window = { from: -1, to: 1 }) => {
    const printer = getPrinterBySlug(db, slug)!;
    const hour = 3_600_000;
    const { token } = await signUploadToken(upload.access, printer, {
      source: 'qr',
      notBefore: new Date(Date.now() + window.from * hour),
      expiresAt: new Date(Date.now() + window.to * hour),
      maxLifetimeMs: upload.access.tokenMaxLifetimeMs,
      now: new Date(Date.now() + window.from * hour),
    });
    return token;
  };

  const postUpload = async (
    form: FormData,
    headers: Record<string, string> = { 'x-print-upload': '1' },
    token?: string | null,
  ) => {
    const authorization = token === undefined ? `Bearer ${await uploadToken()}` : token;
    return fetch(`http://${host}/api/printers/front-office/jobs`, {
      method: 'POST',
      body: form,
      headers: authorization ? { ...headers, authorization } : headers,
    });
  };

  const exchangePin = (pin: unknown, headers: Record<string, string> = {}) =>
    fetch(`http://${host}/api/printers/front-office/token`, {
      method: 'POST',
      headers: { 'x-print-upload': '1', 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ pin }),
    });

  beforeEach(async () => {
    ({ db, jobsDir, cleanup } = await tempDatabase());
    hub = new AgentHub(db, { heartbeatIntervalMs: 60_000 });
    agents = [];
  });

  afterEach(async () => {
    for (const agent of agents) agent.socket.terminate();
    hub.dispose();
    await closeServer(server);
    await cleanup();
  });

  it('pushes an uploaded job to the connected agent immediately and accepts its report', async () => {
    await start();
    const { id, token } = addPrinter(db);
    const agent = await connectAgent(token);

    const response = await postUpload(await uploadForm({ job__title: 'Intake packet' }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { jobId: string; agentOnline: boolean };
    expect(body.agentOnline).toBe(true);

    await expect(agent.next()).resolves.toEqual({
      type: 'jobs',
      jobs: [{ id: body.jobId, title: 'Intake packet' }],
    });

    const unauthorized = await fetch(`http://${host}${agentJobFilePath(body.jobId)}`);
    expect(unauthorized.status).toBe(401);

    const file = await fetch(`http://${host}${agentJobFilePath(body.jobId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    const report = await fetch(`http://${host}${agentJobStatusPath(body.jobId)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'printed' }),
    });
    expect(report.status).toBe(200);
    expect(existsSync(join(jobsDir, `${body.jobId}.pdf`))).toBe(false);

    const again = await fetch(`http://${host}${agentJobStatusPath(body.jobId)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'printed' }),
    });
    expect(again.status).toBe(404);
    expect(hub.isOnline(id)).toBe(true);
  });

  it('queues uploads while the agent is offline and delivers them on connect', async () => {
    await start();
    const { token } = addPrinter(db);

    const response = await postUpload(await uploadForm());
    expect(response.status).toBe(201);
    const { jobId, agentOnline } = (await response.json()) as { jobId: string; agentOnline: boolean };
    expect(agentOnline).toBe(false);

    const agent = await connectAgent(token);
    await expect(agent.next()).resolves.toEqual({ type: 'jobs', jobs: [{ id: jobId, title: 'intake' }] });
  });

  it('rejects cross-site uploads that lack the upload header', async () => {
    await start();
    addPrinter(db);
    expect((await postUpload(await uploadForm(), {})).status).toBe(403);
    expect(
      (
        await postUpload(await uploadForm(), {
          'x-print-upload': '1',
          'sec-fetch-site': 'cross-site',
        })
      ).status,
    ).toBe(403);
  });

  it('requires a valid upload token before reading the upload', async () => {
    await start();
    addPrinter(db);
    addPrinter(db, 'back-office');

    const missing = await postUpload(await uploadForm(), undefined, null);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ code: 'token_required' });

    const other = await postUpload(await uploadForm(), undefined, `Bearer ${await uploadToken('back-office')}`);
    expect(await other.json()).toMatchObject({ code: 'token_invalid' });

    const expired = await postUpload(
      await uploadForm(),
      undefined,
      `Bearer ${await uploadToken('front-office', { from: -3, to: -2 })}`,
    );
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'token_expired' });

    const early = await postUpload(
      await uploadForm(),
      undefined,
      `Bearer ${await uploadToken('front-office', { from: 2, to: 3 })}`,
    );
    expect(await early.json()).toMatchObject({ code: 'token_not_yet_valid' });

    const job = await postUpload(await uploadForm());
    expect(job.status).toBe(201);
    const { jobId } = (await job.json()) as { jobId: string };
    const row = db.prepare('SELECT submitted_by FROM jobs WHERE id = ?').get(jobId) as {
      submitted_by: string;
    };
    expect(row.submitted_by).toMatch(/^qr:\d{4}-[\d-]+T[\d:.]+Z\/\d{4}-[\d-]+T[\d:.]+Z$/);
  });

  it('reports PIN and token status on the public printer endpoint', async () => {
    await start();
    const { id } = addPrinter(db);
    const url = `http://${host}/api/printers/front-office`;

    expect(await (await fetch(url)).json()).toMatchObject({
      access: { pinEnabled: false, token: null },
    });
    setPrinterPin(db, id, '123456789');
    const withToken = await fetch(url, { headers: { authorization: `Bearer ${await uploadToken()}` } });
    expect(await withToken.json()).toMatchObject({
      access: { pinEnabled: true, token: 'valid', tokenExpiresAt: expect.any(String) },
    });
    const bad = await fetch(url, { headers: { authorization: 'Bearer nope' } });
    expect(await bad.json()).toMatchObject({ access: { token: 'invalid', tokenExpiresAt: null } });
  });

  it('exchanges the printer PIN for a short-lived token, once per interval', async () => {
    await start();
    const { id } = addPrinter(db);

    const disabled = await exchangePin('123-456-789');
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ code: 'pin_disabled' });

    setPrinterPin(db, id, '123456789');
    expect((await exchangePin('123-456-789', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const wrong = await exchangePin('999-999-999');
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ code: 'pin_incorrect' });

    const issued = await exchangePin('123 456 789');
    expect(issued.status).toBe(201);
    const { token, expiresAt } = (await issued.json()) as { token: string; expiresAt: string };
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(
      upload.access.pinTokenTtlMs + 60_000,
    );

    const job = await postUpload(await uploadForm(), undefined, `Bearer ${token}`);
    expect(job.status).toBe(201);

    const again = await exchangePin('123-456-789');
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: 'pin_rate_limited' });
  });

  it('locks out a client after repeated wrong PINs', async () => {
    await start();
    const { id } = addPrinter(db);
    setPrinterPin(db, id, '123456789');

    for (let attempt = 0; attempt < upload.access.pinMaxFailures; attempt++)
      expect((await exchangePin('000000000')).status).toBe(401);
    const locked = await exchangePin('123456789');
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: 'pin_locked' });
  });

  it('rejects oversized files and invalid copy counts', async () => {
    await start({ ...testUploadConfig, maxUploadBytes: 100 });
    addPrinter(db);
    const tooBig = await postUpload(await uploadForm());
    expect(tooBig.status).toBe(413);

    await closeServer(server);
    await start();
    const badCopies = await postUpload(await uploadForm({ document__copies_0: '9' }));
    expect(badCopies.status).toBe(400);
  });

  it('streams agent and job events to admins over SSE', async () => {
    await start();
    const { id, token } = addPrinter(db);
    const controller = new AbortController();
    const stream = await fetch(`http://${host}/api/admin/events`, {
      headers: { authorization: 'Bearer admin' },
      signal: controller.signal,
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const events = sseEvents(stream);

    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'snapshot', onlinePrinterIds: [] },
    });

    await connectAgent(token);
    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'agent', printerId: id, online: true },
    });

    await postUpload(await uploadForm());
    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'job', printerId: id, status: 'queued', activeJobs: 1 },
    });
    await expect(events.next()).resolves.toMatchObject({
      value: { type: 'job', printerId: id, status: 'printing', activeJobs: 1 },
    });
    controller.abort();
  });

  it('requires admin auth for the event stream', async () => {
    await start();
    expect((await fetch(`http://${host}/api/admin/events`)).status).toBe(401);
  });
});
