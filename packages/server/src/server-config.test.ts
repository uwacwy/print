import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isAngularDevServer, loadLocalEnvFile, loadServerConfig } from './server-config';

const tenant = '11111111-1111-4111-8111-111111111111';
const client = '22222222-2222-4222-8222-222222222222';
const secret = { UPLOAD_TOKEN_SECRET: 'x'.repeat(32) };

describe('server config', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it('loads Entra settings from the local env file without overriding the environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'print-env-'));
    dirs.push(dir);
    const file = join(dir, '.env');
    writeFileSync(file, `ENTRA_TENANT_ID=${tenant}\nENTRA_CLIENT_ID="${client}"\nSITE_TITLE=From file\n`);
    const env: NodeJS.ProcessEnv = { ...secret, SITE_TITLE: 'From env' };

    loadLocalEnvFile(env, file);
    const config = loadServerConfig(env, false);

    expect(config.adminAuth.tenantId).toBe(tenant);
    expect(config.adminAuth.audience).toEqual([client, `api://${client}`]);
    expect(config.upload.siteTitle).toBe('From env');
  });

  it('ignores a missing env file', () => {
    const env: NodeJS.ProcessEnv = {};
    loadLocalEnvFile(env, join(tmpdir(), 'does-not-exist.env'));
    expect(env).toEqual({});
  });

  it('enables the agent dev gateway only under ng serve unless configured', () => {
    expect(loadServerConfig(secret, true).agentDevGatewayPort).toBe(4201);
    expect(loadServerConfig(secret, false).agentDevGatewayPort).toBeUndefined();
    expect(
      loadServerConfig({ ...secret, AGENT_DEV_GATEWAY_PORT: '0' }, true).agentDevGatewayPort,
    ).toBeUndefined();
    expect(
      loadServerConfig({ ...secret, AGENT_DEV_GATEWAY_PORT: '4300' }, false).agentDevGatewayPort,
    ).toBe(4300);
  });

  it('requires a long upload token secret and derives access limits', () => {
    expect(() => loadServerConfig({}, false)).toThrow('UPLOAD_TOKEN_SECRET is required');
    expect(() => loadServerConfig({ UPLOAD_TOKEN_SECRET: 'short' }, false)).toThrow('at least 32');
    expect(
      loadServerConfig({ ...secret, PIN_TOKEN_INTERVAL_MINUTES: '5', PIN_MAX_FAILURES: '4' }, false)
        .upload.access,
    ).toEqual({
      tokenSecret: secret.UPLOAD_TOKEN_SECRET,
      tokenIssuer: 'uwacwy-print',
      tokenMaxLifetimeMs: 365 * 86_400_000,
      pinTokenTtlMs: 10 * 60_000,
      pinTokenIntervalMs: 5 * 60_000,
      pinMaxFailures: 4,
      ipv6Subnet: 56,
    });
  });

  it('detects the Angular CLI dev server from argv', () => {
    expect(isAngularDevServer(['node', '/app/node_modules/.bin/ng', 'serve', 'print-server'])).toBe(true);
    expect(isAngularDevServer(['node', '/app/node_modules/@angular/cli/bin/ng.js', 's'])).toBe(true);
    expect(isAngularDevServer(['node', '/app/node_modules/.bin/ng', 'build'])).toBe(false);
    expect(isAngularDevServer(['node', '/app/dist/print-server/server/server.mjs'])).toBe(false);
  });
});
