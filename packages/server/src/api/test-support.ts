import type { Server as SocketServer } from 'socket.io';

import { $, ClientConfig } from '@uwacwy/print-shared';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { PDFDocument } from 'pdf-lib';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, expect } from 'vitest';

import type { UploadConfig } from './helpers/server-config/server-config';

import {
  closeServer,
  listen,
  tempDatabase,
  TestAgent,
  testEntra,
  TestLiveClient,
  testUploadConfig,
} from '../realtime/test-support';
import {
  getPrinterBySlug,
  type PrintDatabase,
} from './helpers/database/database';
import apiRoot, { type ApiRootOptions } from './index';
import { createAuthenticate } from './middleware/auth/passport/passport';
import { signUploadToken } from './middleware/auth/upload-token/upload-token';
import installRouter from './routers/install/install.router';
import { AgentHub } from './sockets/agent-hub/agent-hub';
import { attachWebSockets } from './sockets/sockets';

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
export const testSiteUrl = new URL('http://print.test');

export interface StartOptions {
  client?: ClientConfig;
  enrollment?: ApiRootOptions['enrollment'];
  entra?: ApiRootOptions['entra'];
  logo?: ApiRootOptions['logo'];
  upload?: UploadConfig;
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
    ({ cleanup, db, jobsDir } = await tempDatabase());
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
    client,
    entra = defaultEntra,
    logo,
    upload: uploadConfig = defaults.upload ?? testUploadConfig,
    ...rest
  }: StartOptions = {}) => {
    const enrollment =
      'enrollment' in rest
        ? rest.enrollment
        : defaults.enrollment;
    await stop();
    upload = uploadConfig;
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      apiRoot({
        client,
        db,
        enrollment,
        entra,
        getHub: () => hub,
        jobsDir,
        logo,
        siteUrl: testSiteUrl,
        upload,
      }),
    );
    app.use(
      installRouter({
        agentVersion: '9.9.9',
        enrollment,
        upload,
      }),
    );
    server = createServer(app);
    io = attachWebSockets(server, {
      events: {
        events$: new Observable(),
        next: () => {},
      },
      getHub: () => hub,
      verify: createAuthenticate({ db, entra }).verify,
    });
    host = await listen(server);
  };

  /** Opens an agent socket without waiting for its handshake. */
  const openAgent = (token?: string, namespace?: string) => {
    const agent = new TestAgent(
      `http://${host}`,
      token,
      namespace,
    );
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
    const { token } = await signUploadToken(
      upload.access,
      printer,
      {
        expiresAt: new Date(Date.now() + window.to * hour),
        maxLifetimeMs: upload.access.tokenMaxLifetimeMs,
        notBefore: new Date(Date.now() + window.from * hour),
        now: new Date(Date.now() + window.from * hour),
        source: 'qr',
      },
    );
    return token;
  };

  /** Uploads to `front-office`, with a valid QR token unless `authorization` is given (`null` sends none). */
  const postUpload = async (
    form: FormData,
    headers: Record<string, string> = {},
    authorization?: null | string,
  ) => {
    const credential =
      authorization === undefined
        ? `Bearer ${await uploadToken()}`
        : authorization;
    return fetch(
      `http://${host}${$.api.printers.$slug.jobs({ slug: 'front-office' })}`,
      {
        body: form,
        headers: credential
          ? { ...headers, authorization: credential }
          : headers,
        method: 'POST',
      },
    );
  };

  const exchangePin = (pin: string) =>
    fetch(
      `http://${host}${$.api.printers.$slug.token({ slug: 'front-office' })}`,
      {
        headers: { authorization: `Pin ${pin}` },
        method: 'POST',
      },
    );

  return {
    get baseUrl() {
      return `http://${host}`;
    },
    connectAgent,
    get db() {
      return db;
    },
    exchangePin,
    get host() {
      return host;
    },
    get hub() {
      return hub;
    },
    get jobsDir() {
      return jobsDir;
    },
    openAgent,
    openLive,
    postUpload,
    start,
    get upload() {
      return upload;
    },
    uploadToken,
  };
}
