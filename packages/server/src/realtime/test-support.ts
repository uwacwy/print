import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  AGENT_NAMESPACE,
  type AgentClientEvents,
  type AgentJob,
  type AgentServerEvents,
  LIVE_NAMESPACE,
  type LiveEvent,
  type LiveServerEvents,
  SOCKET_PATH,
  type SocketAuthError,
} from '@uwacwy/print-shared';
import { type JWTPayload, SignJWT } from 'jose';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';

import type { UploadConfig } from '../api/helpers/server-config/server-config';
import type { EntraUserOptions } from '../api/middleware/auth/entra-user/entra-user.strategy';

import {
  createPrinter,
  openDatabase,
  type PrintDatabase,
} from '../api/helpers/database/database';

export const testUploadConfig: UploadConfig = {
  access: {
    ipv6Subnet: 56,
    pinMaxFailures: 3,
    pinTokenIntervalMs: 10 * 60_000,
    pinTokenTtlMs: 10 * 60_000,
    tokenIssuer: '22222222-2222-4222-8222-222222222222',
    tokenMaxLifetimeMs: 365 * 86_400_000,
    tokenSecret: 'test-upload-token-secret-that-is-long-enough',
  },
  imageDpi: 150,
  maxCopies: 5,
  maxDocumentsPerJob: 3,
  maxUploadBytes: 1024 * 1024,
  siteTitle: 'Test Print',
  timeZone: 'America/Denver',
  uploadsPerMinute: 100,
};

export type AgentMessage =
  | { jobs: AgentJob[]; type: 'jobs' }
  | { printer: { name: string; slug: string }; type: 'hello' };

/** Queues received values so tests can await them in order. */
class Inbox<T> {
  readonly #queued: T[] = [];
  readonly #waiters: ((value: T) => void)[] = [];

  next(timeoutMs: number): Promise<T> {
    if (this.#queued.length) {
      return Promise.resolve(this.#queued.shift() as T);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for message')),
        timeoutMs,
      );
      this.#waiters.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  push(value: T): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(value);
    } else {
      this.#queued.push(value);
    }
  }
}

/** A socket.io test client that never reconnects, so every outcome is observable. */
class TestSocket<Listen extends object, Emit extends object, T> {
  readonly socket: Socket<Listen, Emit>;
  protected readonly inbox = new Inbox<T>();

  constructor(
    baseUrl: string,
    namespace: string,
    token?: string,
  ) {
    this.socket = io(new URL(namespace, baseUrl).href, {
      auth: token === undefined ? {} : { token },
      forceNew: true,
      path: SOCKET_PATH,
      reconnection: false,
      transports: ['websocket'],
    });
  }

  close(): void {
    this.socket.close();
  }

  /** Resolves with the disconnect reason, e.g. `io server disconnect`. */
  closed(): Promise<string> {
    return new Promise((resolve) =>
      this.socket.once('disconnect', (reason) =>
        resolve(reason),
      ),
    );
  }

  next(timeoutMs = 2000): Promise<T> {
    return this.inbox.next(timeoutMs);
  }

  /** Resolves with the handshake rejection. */
  rejected(): Promise<{
    data?: SocketAuthError;
    message: string;
  }> {
    return new Promise((resolve) =>
      this.socket.once('connect_error', (error) =>
        resolve({
          data: (error as { data?: SocketAuthError }).data,
          message: error.message,
        }),
      ),
    );
  }
}

/** A minimal print agent that queues every server event for assertions. */
export class TestAgent extends TestSocket<
  AgentServerEvents,
  AgentClientEvents,
  AgentMessage
> {
  constructor(
    baseUrl: string,
    token?: string,
    namespace = AGENT_NAMESPACE,
  ) {
    super(baseUrl, namespace, token);
    const socket = this.socket as Socket<AgentServerEvents>;
    socket.on('hello', (printer) =>
      this.inbox.push({ printer, type: 'hello' }),
    );
    socket.on('jobs', (jobs) =>
      this.inbox.push({ jobs, type: 'jobs' }),
    );
  }
}

/** A management UI stand-in that queues every live event. */
export class TestLiveClient extends TestSocket<
  LiveServerEvents,
  Record<string, never>,
  LiveEvent
> {
  constructor(baseUrl: string, token?: string) {
    super(baseUrl, LIVE_NAMESPACE, token);
    (this.socket as Socket<LiveServerEvents>).on(
      'live',
      (event) => this.inbox.push(event),
    );
  }
}

export function addPrinter(
  db: PrintDatabase,
  slug = 'front-office',
) {
  const created = createPrinter(db, {
    cover_page: false,
    name: 'Front Office',
    queue: 'cups://Front_Office',
    slug,
  });
  if (typeof created === 'string') {
    throw new Error(created);
  }
  return created;
}

export function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  );
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export async function tempDatabase(): Promise<{
  cleanup: () => Promise<void>;
  db: PrintDatabase;
  jobsDir: string;
}> {
  const dataDir = await mkdtemp(
    join(tmpdir(), 'omega-print-realtime-'),
  );
  const { db, jobsDir } = openDatabase(dataDir);
  return {
    cleanup: async () => {
      db.close();
      await rm(dataDir, { force: true, recursive: true });
    },
    db,
    jobsDir,
  };
}

/**
 * A stand-in Entra tenant: real RS256 access tokens checked by the real passport-jwt strategy,
 * with the JWKS lookup replaced by a local public key.
 */
export function testEntra(
  options: Partial<EntraUserOptions> = {},
) {
  const tenantId = '123e4567-e89b-12d3-a456-426614174000';
  const audience = 'api://print-api';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicPem = publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString();
  const entra: EntraUserOptions = {
    adminGroupIds: [],
    audience,
    keyProvider: (_request, _token, done) =>
      done(null, publicPem),
    tenantId,
    ...options,
  };
  const token = (
    claims: JWTPayload,
    {
      issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`,
      key = privateKey,
    } = {},
  ) =>
    new SignJWT({ ver: '2.0', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  const bearer = async (claims: JWTPayload) =>
    `Bearer ${await token(claims)}`;
  return { bearer, entra, token };
}
