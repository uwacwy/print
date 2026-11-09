import { createServer, type Server } from 'node:http';
import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, expect } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import {
  getPrinterBySlug,
  type PrintDatabase,
} from './helpers/database/database';
import { signUploadToken } from './middleware/auth/upload-token/upload-token';
import { createAuthenticate } from './middleware/auth/passport/passport';
import { AgentHub } from './sockets/agent-hub/agent-hub';
import { attachWebSockets } from './sockets/sockets';
import {
  closeServer,
  listen,
  tempDatabase,
  TestAgent,
  TestLiveClient,
  testEntra,
  testUploadConfig,
} from '../realtime/test-support';
import type { UploadConfig } from './helpers/server-config/server-config';
import apiRoot, { type ApiRootOptions } from './index';
import installRouter from './routers/install/install.router';
import { Observable } from 'rxjs';

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

/** The origin the test API reports as its public URL. */
export const testPublicUrl = new URL('http://print.test');

export interface StartOptions {
  upload?: UploadConfig;
  entra?: ApiRootOptions['entra'];
  client?: ApiRootOptions['client'];
  enrollment?: ApiRootOptions['enrollment'];
}

/**
 * Serves `/api` (including `/api/agent`) and socket.io over a fresh database for each
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
  let io: SocketServer | undefined;
  let host: string;
  let upload: UploadConfig;
  const clients: { close(): void }[] = [];

  beforeEach(async () => {
    ({ db, jobsDir, cleanup } = await tempDatabase());
    hub = new AgentHub(db);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }
    hub.dispose();
    await stop();
    await cleanup();
  });

  const stop = async () => {
    // Disconnects every socket; closeServer then drops the remaining HTTP connections.
    void io?.close();
    io = undefined;
    if (server) {
      await closeServer(server);
      server = undefined;
    }
  };

  const start = async ({
    upload: uploadConfig = defaults.upload ?? testUploadConfig,
    entra = defaultEntra,
    client,
    // `{ enrollment: undefined }` disables enrollment for one test.
    ...rest
  }: StartOptions = {}) => {
    const enrollment =
      'enrollment' in rest ? rest.enrollment : defaults.enrollment;
    await stop();
    upload = uploadConfig;
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      apiRoot({
        db,
        jobsDir,
        getHub: () => hub,
        upload,
        entra,
        client,
        enrollment,
        publicUrl: testPublicUrl,
      }),
    );
    app.use(
      installRouter({ upload, enrollment, agentVersion: '9.9.9' }),
    );
    server = createServer(app);
    io = attachWebSockets(server, {
      getHub: () => hub,
      verify: createAuthenticate({ db, entra }).verify,
      events: {
        next: () => {},
        events$: new Observable(),
      },
    });
    host = await listen(server);
  };

  /** Opens an agent socket without waiting for its handshake. */
  const openAgent = (token?: string, namespace?: string) => {
    const agent = new TestAgent(`http://${host}`, token, namespace);
    clients.push(agent);
    return agent;
  };

  /** Connects an agent and consumes its `hello`. */
  const connectAgent = async (token: string) => {
    const agent = openAgent(token);
    await expect(agent.next()).resolves.toMatchObject({
      type: 'hello',
    });
    return agent;
  };

  const openLive = (token?: string) => {
    const client = new TestLiveClient(`http://${host}`, token);
    clients.push(client);
    return client;
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
    openAgent,
    connectAgent,
    openLive,
    uploadToken,
    postUpload,
    exchangePin,
  };
}
