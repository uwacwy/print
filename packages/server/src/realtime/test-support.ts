import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import {
  parseServerMessage,
  type ServerMessage,
} from '@uwacwy/print-shared';
import {
  createPrinter,
  openDatabase,
  type PrintDatabase,
} from '../lib/database/database.js';
import type { UploadConfig } from '../server-config';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, type JWTPayload } from 'jose';
import type { EntraUserOptions } from '../api/middleware/auth/entra-user.strategy';

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

/** A minimal agent client that queues every parsed server message for assertions. */
export class TestAgent {
  readonly socket: WebSocket;
  readonly #messages: ServerMessage[] = [];
  readonly #waiters: ((message: ServerMessage) => void)[] = [];

  constructor(url: string, token: string) {
    this.socket = new WebSocket(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    this.socket.on('message', (raw) => {
      const message = parseServerMessage(raw.toString());
      if (!message) {
        return;
      }
      const waiter = this.#waiters.shift();
      if (waiter) {
        waiter(message);
      } else {
        this.#messages.push(message);
      }
    });
  }

  next(timeoutMs = 2000): Promise<ServerMessage> {
    const queued = this.#messages.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for message')),
        timeoutMs,
      );
      this.#waiters.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  closed(): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) =>
      this.socket.once('close', (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      ),
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
