import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import {
  AGENT_NAMESPACE,
  LIVE_NAMESPACE,
  SOCKET_PATH,
  type AgentClientEvents,
  type AgentJob,
  type AgentServerEvents,
  type LiveEvent,
  type LiveServerEvents,
  type SocketAuthError,
} from '@uwacwy/print-shared';
import {
  createPrinter,
  openDatabase,
  type PrintDatabase,
} from '../api/helpers/database/database.js';
import type { UploadConfig } from '../server-config';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, type JWTPayload } from 'jose';
import type { EntraUserOptions } from '../api/middleware/auth/entra-user/entra-user.strategy';

export const testUploadConfig: UploadConfig = {
  siteTitle: 'Test Print',
  timeZone: 'America/Denver',
  maxUploadBytes: 1024 * 1024,
  maxDocumentsPerJob: 3,
  maxCopies: 5,
  uploadsPerMinute: 100,
  access: {
    tokenSecret: 'test-upload-token-secret-that-is-long-enough',
    tokenIssuer: '22222222-2222-4222-8222-222222222222',
    tokenMaxLifetimeMs: 365 * 86_400_000,
    pinTokenTtlMs: 10 * 60_000,
    pinTokenIntervalMs: 10 * 60_000,
    pinMaxFailures: 3,
    ipv6Subnet: 56,
  },
};

export async function tempDatabase(): Promise<{
  db: PrintDatabase;
  jobsDir: string;
  cleanup: () => Promise<void>;
}> {
  const dataDir = await mkdtemp(
    join(tmpdir(), 'omega-print-realtime-'),
  );
  const { db, jobsDir } = openDatabase(dataDir);
  return {
    db,
    jobsDir,
    cleanup: async () => {
      db.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

export function addPrinter(
  db: PrintDatabase,
  slug = 'front-office',
) {
  const created = createPrinter(db, {
    slug,
    name: 'Front Office',
    queue: 'cups://Front_Office',
    cover_page: false,
  });
  if (typeof created === 'string') {
    throw new Error(created);
  }
  return created;
}

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  );
  return `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Queues received values so tests can await them in order. */
class Inbox<T> {
  readonly #queued: T[] = [];
  readonly #waiters: ((value: T) => void)[] = [];

  push(value: T): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(value);
    } else {
      this.#queued.push(value);
    }
  }

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
}

/** A socket.io test client that never reconnects, so every outcome is observable. */
class TestSocket<Listen extends object, Emit extends object, T> {
  readonly socket: Socket<Listen, Emit>;
  protected readonly inbox = new Inbox<T>();

  constructor(baseUrl: string, namespace: string, token?: string) {
    this.socket = io(new URL(namespace, baseUrl).href, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      auth: token === undefined ? {} : { token },
      reconnection: false,
      forceNew: true,
    });
  }

  next(timeoutMs = 2000): Promise<T> {
    return this.inbox.next(timeoutMs);
  }

  /** Resolves with the disconnect reason, e.g. `io server disconnect`. */
  closed(): Promise<string> {
    return new Promise((resolve) =>
      this.socket.once('disconnect', (reason) => resolve(reason)),
    );
  }

  /** Resolves with the handshake rejection. */
  rejected(): Promise<{ message: string; data?: SocketAuthError }> {
    return new Promise((resolve) =>
      this.socket.once('connect_error', (error) =>
        resolve({
          message: error.message,
          data: (error as { data?: SocketAuthError }).data,
        }),
      ),
    );
  }

  close(): void {
    this.socket.close();
  }
}

export type AgentMessage =
  | { type: 'hello'; printer: { slug: string; name: string } }
  | { type: 'jobs'; jobs: AgentJob[] };

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
      this.inbox.push({ type: 'hello', printer }),
    );
    socket.on('jobs', (jobs) =>
      this.inbox.push({ type: 'jobs', jobs }),
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
    (this.socket as Socket<LiveServerEvents>).on('live', (event) =>
      this.inbox.push(event),
    );
  }
}

/**
 * A stand-in Entra tenant: real RS256 access tokens checked by the real passport-jwt strategy,
 * with the JWKS lookup replaced by a local public key.
 */
export function testEntra(options: Partial<EntraUserOptions> = {}) {
  const tenantId = '123e4567-e89b-12d3-a456-426614174000';
  const audience = 'api://print-api';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicPem = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  const entra: EntraUserOptions = {
    tenantId,
    audience,
    adminGroupIds: [],
    keyProvider: (_request, _token, done) => done(null, publicPem),
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
  return { entra, token, bearer };
}
