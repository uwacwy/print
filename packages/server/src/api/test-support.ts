import { createServer, type Server } from 'node:http';
import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, expect } from 'vitest';
import { AGENT_WS_PATH } from '@uwacwy/print-shared';
import {
  getPrinterBySlug,
  getPrinterByToken,
  type PrintDatabase,
} from './helpers/database/database';
import { signUploadToken } from './middleware/auth/upload-token/upload-token';
import { attachAgentGateway } from '../realtime/agent-gateway';
import { AgentHub } from '../realtime/agent-hub';
import {
  closeServer,
  listen,
  tempDatabase,
  TestAgent,
  testEntra,
  testUploadConfig,
} from '../realtime/test-support';
import type { UploadConfig } from '../server-config';
import agentRouter from './routers/agent/agent.router';
import apiRoot, { type ApiRootOptions } from './index';

export async function samplePdf(): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return new Blob([new Uint8Array(await pdf.save())], {
    type: 'application/pdf',
  });
}

export async function uploadForm(
  fields: Record<string, string> = {},
): Promise<FormData> {
  const form = new FormData();
  form.set('document__file_0', await samplePdf(), 'intake.pdf');
  form.set('document__copies_0', '1');
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }
  return form;
}

export interface StartOptions {
  upload?: UploadConfig;
  entra?: ApiRootOptions['entra'];
}

/**
 * Serves `/api`, `/agent`, and the agent WebSocket gateway over a fresh database for each
 * test, trusting a stand-in Entra tenant unless one is given. Call `start()` in a test or
 * `beforeEach`; calling it again restarts the server.
 */
export function useApiServer(defaults: StartOptions = {}) {
  const defaultEntra = defaults.entra ?? testEntra().entra;
  let db: PrintDatabase;
  let jobsDir: string;
  let cleanup: () => Promise<void>;
  let hub: AgentHub;
  let server: Server | undefined;
  let host: string;
  let upload: UploadConfig;
  const agents: TestAgent[] = [];

  beforeEach(async () => {
    ({ db, jobsDir, cleanup } = await tempDatabase());
    hub = new AgentHub(db, { heartbeatIntervalMs: 60_000 });
  });

  afterEach(async () => {
    for (const agent of agents.splice(0)) {
      agent.socket.terminate();
    }
    hub.dispose();
    if (server) {
      await closeServer(server);
      server = undefined;
    }
    await cleanup();
  });

  const start = async ({
    upload: uploadConfig = defaults.upload ?? testUploadConfig,
    entra = defaultEntra,
  }: StartOptions = {}) => {
    if (server) {
      await closeServer(server);
    }
    upload = uploadConfig;
    const app = express();
    app.use(express.json());
    app.use(
      '/agent',
      agentRouter({ db, jobsDir, getHub: () => hub }),
    );
    app.use(
      '/api',
      apiRoot({ db, jobsDir, getHub: () => hub, upload, entra }),
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
    const agent = new TestAgent(
      `ws://${host}${AGENT_WS_PATH}`,
      token,
    );
    agents.push(agent);
    await expect(agent.next()).resolves.toMatchObject({
      type: 'hello',
    });
    return agent;
  };

  /** A QR upload token valid from `window.from` to `window.to` hours from now. */
  const uploadToken = async (
    slug = 'front-office',
    window = { from: -1, to: 1 },
  ) => {
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

  /** Uploads to `front-office`, with a valid QR token unless `authorization` is given (`null` sends none). */
  const postUpload = async (
    form: FormData,
    headers: Record<string, string> = { 'x-print-upload': '1' },
    authorization?: string | null,
  ) => {
    const credential =
      authorization === undefined
        ? `Bearer ${await uploadToken()}`
        : authorization;
    return fetch(`http://${host}/api/printers/front-office/jobs`, {
      method: 'POST',
      body: form,
      headers: credential
        ? { ...headers, authorization: credential }
        : headers,
    });
  };

  const exchangePin = (
    pin: string,
    headers: Record<string, string> = {},
  ) =>
    fetch(`http://${host}/api/printers/front-office/token`, {
      method: 'POST',
      headers: {
        'x-print-upload': '1',
        authorization: `Pin ${pin}`,
        ...headers,
      },
    });

  return {
    get db() {
      return db;
    },
    get jobsDir() {
      return jobsDir;
    },
    get hub() {
      return hub;
    },
    get host() {
      return host;
    },
    get baseUrl() {
      return `http://${host}`;
    },
    get upload() {
      return upload;
    },
    start,
    connectAgent,
    uploadToken,
    postUpload,
    exchangePin,
  };
}
