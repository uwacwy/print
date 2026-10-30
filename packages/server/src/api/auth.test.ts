import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import apiRoot, { type ApiRootOptions } from './index';
import { selectChallenge } from './middleware/auth/passport';
import {
  openDatabase,
  type PrintDatabase,
} from '../lib/database/database.js';
import { AgentHub } from '../realtime/agent-hub';
import {
  testEntra,
  testUploadConfig,
} from '../realtime/test-support';

describe('Entra user authentication', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let dataDir: string;
  let db: PrintDatabase;
  const { entra, token, bearer } = testEntra({
    adminRole: 'PrintAdmin',
    adminGroupIds: ['admin-group-id'],
  });
  const roleAdmin = () =>
    bearer({
      sub: 'role-admin',
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
    });

  const serve = async (
    entraOptions: ApiRootOptions['entra'] = entra,
  ) => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      apiRoot({
        db,
        jobsDir: join(dataDir, 'jobs'),
        getHub: () => new AgentHub(db),
        upload: testUploadConfig,
        entra: entraOptions,
      }),
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) =>
      server.once('listening', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  const session = async (authorization?: string) =>
    fetch(`${baseUrl}/api/session`, {
      headers: authorization ? { authorization } : {},
    });

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'omega-print-api-'));
    db = openDatabase(dataDir).db;
    await serve();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    db.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('keeps health public, protects management routes, and has no /admin prefix', async () => {
    expect((await fetch(`${baseUrl}/api/healthz`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/printers`)).status).toBe(
      401,
    );
    expect(
      (await fetch(`${baseUrl}/api/admin/session`)).status,
    ).toBe(404);
  });

  it('rejects absent, forged, and foreign-tenant tokens', async () => {
    const missing = await session();
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(await missing.json()).toMatchObject({
      code: 'access_token_required',
    });

    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const claims = {
      sub: 'role-admin',
      roles: ['PrintAdmin'],
      scp: 'Printers.Manage',
    };
    for (const forged of [
      await token(claims, { key: privateKey }),
      await token(claims, {
        issuer:
          'https://login.microsoftonline.com/another-tenant/v2.0',
      }),
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.sig',
    ]) {
      const response = await session(`Bearer ${forged}`);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer error="invalid_token"',
      );
      expect(await response.json()).toMatchObject({
        code: 'access_token_invalid',
      });
    }
  });

  it('denies users without the scope or an admin role or group', async () => {
    const ordinary = await session(
      await bearer({ sub: 'user', scp: 'Printers.Manage' }),
    );
    expect(ordinary.status).toBe(403);
    expect(await ordinary.json()).toMatchObject({
      code: 'admin_access_required',
    });

    const wrongScope = await session(
      await bearer({
        sub: 'user',
        scp: 'User.Read',
        roles: ['PrintAdmin'],
      }),
    );
    expect(wrongScope.status).toBe(403);
    expect(await wrongScope.json()).toMatchObject({
      code: 'admin_scope_required',
      scope: 'Printers.Manage',
    });
  });

  it('accepts the admin app role or group, with v1 or v2 issuers', async () => {
    const role = await session(await roleAdmin());
    expect(role.status).toBe(200);
    expect(await role.json()).toEqual({
      user: { id: 'role-admin', roles: ['PrintAdmin'] },
    });

    const group = await session(
      await bearer({
        oid: 'group-admin-oid',
        sub: 'pairwise',
        groups: ['admin-group-id'],
        scp: 'Printers.Manage',
      }),
    );
    expect(await group.json()).toEqual({
      user: { id: 'group-admin-oid', roles: [] },
    });

    const v1 = await session(
      `Bearer ${await token(
        {
          ver: '1.0',
          sub: 'v1-admin',
          roles: ['PrintAdmin'],
          scp: 'Printers.Manage',
        },
        { issuer: `https://sts.windows.net/${entra.tenantId}/` },
      )}`,
    );
    expect(v1.status).toBe(200);
  });

  it('lets the delegated scope alone authorize when no role or group is configured', async () => {
    await new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    await serve({
      ...entra,
      adminRole: undefined,
      adminGroupIds: [],
    });
    expect(
      (
        await session(
          await bearer({ sub: 'user', scp: 'Printers.Manage' }),
        )
      ).status,
    ).toBe(200);
  });

  it('answers 503 to presented tokens when Entra is not configured', async () => {
    await new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    await serve({ adminGroupIds: [] });
    expect((await session(await roleAdmin())).status).toBe(503);
    expect((await session()).status).toBe(401);
  });

  it('creates, lists, exposes safe public details, updates, and deletes printers by slug', async () => {
    const authorization = await roleAdmin();
    const json = {
      authorization,
      'content-type': 'application/json',
    };
    const createdResponse = await fetch(`${baseUrl}/api/printers`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        slug: 'front-office',
        name: 'Front Office',
        queue: 'cups://Front_Office',
        coverPage: true,
      }),
    });
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
      `${baseUrl}/api/printers/front-office`,
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
      `${baseUrl}/api/printers/front-office`,
      { headers: { authorization } },
    );
    expect(await managed.json()).toMatchObject({
      id: created.printer.id,
      queue: 'cups://Front_Office',
      access: { token: null },
    });

    const list = await (
      await fetch(`${baseUrl}/api/printers`, {
        headers: { authorization },
      })
    ).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      queue: 'cups://Front_Office',
      online: false,
    });

    const updateResponse = await fetch(
      `${baseUrl}/api/printers/front-office`,
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
      `${baseUrl}/api/printers/front-office`,
      { method: 'DELETE' },
    );
    expect(anonymousDelete.status).toBe(401);
    const deleteResponse = await fetch(
      `${baseUrl}/api/printers/front-office`,
      {
        method: 'DELETE',
        headers: { authorization },
      },
    );
    expect(deleteResponse.status).toBe(204);
    expect(
      (await fetch(`${baseUrl}/api/printers/front-office`)).status,
    ).toBe(404);
  });
});

describe('selectChallenge', () => {
  const missing = (code: string) => ({
    code,
    error: code,
    status: 401 as const,
    presented: false,
  });
  it('prefers the first presented credential, else the first strategy', () => {
    const presented = {
      code: 'token_expired',
      error: '',
      status: 401 as const,
      presented: true,
    };
    expect(
      selectChallenge([missing('a'), presented, missing('b')]),
    ).toBe(presented);
    expect(selectChallenge([missing('a'), missing('b')]).code).toBe(
      'a',
    );
    expect(selectChallenge([new Error('x')]).code).toBe(
      'unauthorized',
    );
  });
});
