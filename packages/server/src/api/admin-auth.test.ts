import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { JWTPayload } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminAuth, type EntraAccessTokenVerifier } from './admin-auth';
import apiRoot from './index';
import { openDatabase, type PrintDatabase } from '../lib/database/database.js';
import { AgentHub } from '../realtime/agent-hub';
import { testUploadConfig } from '../realtime/test-support';

describe('admin REST authentication', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;
  let dataDir: string;
  let db: PrintDatabase;

  const verifyAccessToken: EntraAccessTokenVerifier = async (token) => {
    if (token === 'invalid') throw new Error('invalid token');
    if (token === 'admin-role') {
      return {
        sub: 'role-admin',
        roles: ['PrintAdmin'],
        scp: 'Printers.Manage',
      } as JWTPayload;
    }
    if (token === 'admin-group') {
      return {
        sub: 'group-admin',
        groups: ['admin-group-id'],
        scp: 'Printers.Manage',
      } as JWTPayload;
    }
    if (token === 'wrong-scope') {
      return { sub: 'scope-user', scp: 'User.Read' } as JWTPayload;
    }
    return { sub: 'ordinary-user', scp: 'Printers.Manage' } as JWTPayload;
  };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'omega-print-api-'));
    const database = openDatabase(dataDir);
    db = database.db;
    const hub = new AgentHub(db);
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      apiRoot({
        db,
        jobsDir: database.jobsDir,
        getHub: () => hub,
        upload: testUploadConfig,
        adminAuth: {
          tenantId: '123e4567-e89b-12d3-a456-426614174000',
          audience: 'api://print-api',
          adminRole: 'PrintAdmin',
          adminGroupIds: ['admin-group-id'],
        },
        verifyAccessToken,
      }),
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    db.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('keeps health and public printer routes outside admin auth', async () => {
    const health = await fetch(`${baseUrl}/api/healthz`);
    const printers = await fetch(`${baseUrl}/api/printers`);

    expect(health.status).toBe(200);
    expect(printers.status).toBe(404);
  });

  it('rejects absent and invalid bearer tokens', async () => {
    const missing = await fetch(`${baseUrl}/api/admin/session`);
    const invalid = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { authorization: 'Bearer invalid' },
    });

    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(invalid.status).toBe(401);
  });

  it('denies authenticated users without an admin role or group', async () => {
    const response = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { authorization: 'Bearer ordinary' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'admin_access_required',
    });
  });

  it('denies tokens that do not grant the management scope', async () => {
    const response = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { authorization: 'Bearer wrong-scope' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'admin_scope_required',
      scope: 'Printers.Manage',
    });
  });

  it('allows the delegated scope to authorize admins when no extra assignment is configured', async () => {
    const app = express();
    app.get(
      '/protected',
      createAdminAuth(
        {
          tenantId: '123e4567-e89b-12d3-a456-426614174000',
          audience: 'api://print-api',
          adminGroupIds: [],
        },
        verifyAccessToken,
      ),
      (_request, response) => response.sendStatus(204),
    );
    const scopeOnlyServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => scopeOnlyServer.once('listening', resolve));
    const address = scopeOnlyServer.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/protected`, {
        headers: { authorization: 'Bearer ordinary' },
      });
      expect(response.status).toBe(204);
    } finally {
      await new Promise<void>((resolve, reject) =>
        scopeOnlyServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('accepts configured app roles and admin groups', async () => {
    const roleResponse = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { authorization: 'Bearer admin-role' },
    });
    const groupResponse = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { authorization: 'Bearer admin-group' },
    });

    expect(roleResponse.status).toBe(200);
    await expect(roleResponse.json()).resolves.toEqual({
      user: { id: 'role-admin', roles: ['PrintAdmin'] },
    });
    expect(groupResponse.status).toBe(200);
  });

  it('creates, lists, exposes safe public details, updates, and deletes printers', async () => {
    const adminHeaders = {
      authorization: 'Bearer admin-role',
      'content-type': 'application/json',
    };
    const createdResponse = await fetch(`${baseUrl}/api/admin/printers`, {
      method: 'POST',
      headers: adminHeaders,
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

    const publicResponse = await fetch(`${baseUrl}/api/printers/front-office`);
    const publicPrinter = await publicResponse.json();
    expect(publicResponse.status).toBe(200);
    expect(publicPrinter).toEqual({
      slug: 'front-office',
      name: 'Front Office',
      coverPage: true,
      access: { pinEnabled: false, token: null, tokenExpiresAt: null },
      upload: {
        maxDocuments: testUploadConfig.maxDocumentsPerJob,
        maxCopies: testUploadConfig.maxCopies,
        maxUploadBytes: testUploadConfig.maxUploadBytes,
      },
    });

    const listResponse = await fetch(`${baseUrl}/api/admin/printers`, {
      headers: { authorization: 'Bearer admin-role' },
    });
    const list = await listResponse.json();
    expect(list).toHaveLength(1);
    expect(list[0].queue).toBe('cups://Front_Office');
    expect(list[0].online).toBe(false);

    const updateResponse = await fetch(`${baseUrl}/api/admin/printers/${created.printer.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        slug: 'front-office',
        name: 'Reception',
        queue: 'cups://Front_Office',
        coverPage: false,
      }),
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      name: 'Reception',
      coverPage: false,
    });

    const deleteResponse = await fetch(`${baseUrl}/api/admin/printers/${created.printer.id}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer admin-role' },
    });
    expect(deleteResponse.status).toBe(204);
    expect((await fetch(`${baseUrl}/api/printers/front-office`)).status).toBe(404);
  });
});
