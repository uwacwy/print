import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const entraEnv = {
  ENTRA_TENANT_ID: '123e4567-e89b-12d3-a456-426614174000',
  ENTRA_CLIENT_ID: '123e4567-e89b-12d3-a456-426614174001',
  ENTRA_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: 'this-is-a-test-secret-with-at-least-32-bytes',
  PUBLIC_URL: 'https://print.example.org',
};

describe('server configuration', () => {
  it('keeps authentication optional when no passcode or Entra settings exist', () => {
    const config = loadConfig({});
    expect(config.entra).toBeUndefined();
    expect(config.passcode).toBeUndefined();
    expect(config.maxDocumentsPerJob).toBe(5);
    expect(
      loadConfig({ MAX_DOCUMENTS_PER_JOB: '3' }).maxDocumentsPerJob,
    ).toBe(3);
  });

  it('requires complete Entra settings and enables the configured tenant', () => {
    const config = loadConfig(entraEnv);
    expect(config.entra?.tenantId).toBe(entraEnv.ENTRA_TENANT_ID);
    expect(config.publicUrl?.href).toBe(
      'https://print.example.org/',
    );
    expect(config.session).toBeDefined();
    expect(() =>
      loadConfig({ ENTRA_CLIENT_ID: entraEnv.ENTRA_CLIENT_ID }),
    ).toThrow(/ENTRA_TENANT_ID/);
    expect(() =>
      loadConfig({
        ...entraEnv,
        PUBLIC_URL: 'http://print.example.org',
      }),
    ).toThrow(/Must use HTTPS/);
    expect(
      loadConfig({
        ...entraEnv,
        PUBLIC_URL: 'http://localhost:8080',
      }).entra,
    ).toBeDefined();
  });

  it('requires database credentials when a passcode query is configured', () => {
    expect(() =>
      loadConfig({
        AUTHORIZATION_QUERY: 'SELECT 1 WHERE token = ?',
      }),
    ).toThrow(/AUTH_DB_USER/);
  });
});
