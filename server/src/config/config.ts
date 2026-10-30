import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PasscodeConfig } from '../../../packages/server/src/lib/passcode.js';

export type { PasscodeConfig };

const SECRET_FILE_KEYS = [
  'AUTH_DB_PASSWORD',
  'ENTRA_CLIENT_SECRET',
  'SESSION_SECRET',
] as const;

const flag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DATA_DIR: z.string().default('/data'),
    SITE_TITLE: z.string().default('VITA Secure Print'),
    TIME_ZONE: z
      .string()
      .default('America/Denver')
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, 'Must be an IANA time zone such as America/Denver'),
    PUBLIC_URL: z.string().url().optional(),
    TRUST_PROXY: flag,
    LOG_LEVEL: z
      .enum([
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
        'silent',
      ])
      .default('info'),
    MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(20),
    MAX_DOCUMENTS_PER_JOB: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5),
    MAX_COPIES: z.coerce.number().int().min(1).max(5).default(5),
    UPLOADS_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    JOB_TTL_HOURS: z.coerce.number().positive().default(24),
    RETENTION_DAYS: z.coerce.number().positive().default(7),

    AUTHORIZATION_QUERY: z.string().optional(),
    AUTH_DB_HOST: z.string().default('localhost'),
    AUTH_DB_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(3306),
    AUTH_DB_USER: z.string().optional(),
    AUTH_DB_PASSWORD: z.string().optional(),
    AUTH_DB_NAME: z.string().optional(),

    ENTRA_TENANT_ID: z.string().uuid().optional(),
    ENTRA_CLIENT_ID: z.string().uuid().optional(),
    ENTRA_CLIENT_SECRET: z.string().optional(),
    ENTRA_ADMIN_GROUP_IDS: csv,
    ENTRA_ADMIN_EMAILS: csv,
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters')
      .optional(),
    SESSION_HOURS: z.coerce
      .number()
      .positive()
      .max(24 * 7)
      .default(12),
  })
  .superRefine((env, ctx) => {
    if (env.AUTHORIZATION_QUERY) {
      for (const key of ['AUTH_DB_USER', 'AUTH_DB_NAME'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when AUTHORIZATION_QUERY is set',
          });
        }
      }
    }
    const entraKeys = [
      'ENTRA_TENANT_ID',
      'ENTRA_CLIENT_ID',
      'ENTRA_CLIENT_SECRET',
      'SESSION_SECRET',
      'PUBLIC_URL',
    ] as const;
    if (
      entraKeys.some(
        (key) =>
          key !== 'PUBLIC_URL' &&
          key !== 'SESSION_SECRET' &&
          env[key],
      )
    ) {
      for (const key of entraKeys) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when Entra ID sign-in is configured',
          });
        }
      }
      if (
        env.PUBLIC_URL &&
        !env.PUBLIC_URL.startsWith('https://') &&
        !isLoopbackUrl(env.PUBLIC_URL)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_URL'],
          message:
            'Must use HTTPS when Entra ID sign-in is configured',
        });
      }
    }
  });

// Entra accepts http redirect URIs only for localhost, which is enough for local development.
function isLoopbackUrl(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  adminGroupIds: string[];
  adminEmails: string[];
}

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  siteTitle: string;
  timeZone: string;
  publicUrl: URL | undefined;
  trustProxy: boolean;
  logLevel: string;
  maxUploadBytes: number;
  maxDocumentsPerJob: number;
  maxCopies: number;
  uploadsPerMinute: number;
  jobTtlMs: number;
  retentionMs: number;
  passcode: PasscodeConfig | undefined;
  entra: EntraConfig | undefined;
  session: { secret: string; ttlMs: number } | undefined;
}

function resolveEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') {
      resolved[key] = value;
    }
  }
  for (const key of SECRET_FILE_KEYS) {
    const file = resolved[`${key}_FILE`];
    if (file && !resolved[key]) {
      const value = readFileSync(file, 'utf8').trim();
      if (value) {
        resolved[key] = value;
      }
    }
  }
  return resolved;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const parsed = schema.safeParse(resolveEnv(env));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }
  const e = parsed.data;
  return {
    host: e.HOST,
    port: e.PORT,
    dataDir: e.DATA_DIR,
    siteTitle: e.SITE_TITLE,
    timeZone: e.TIME_ZONE,
    publicUrl: e.PUBLIC_URL ? new URL(e.PUBLIC_URL) : undefined,
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    maxUploadBytes: Math.floor(e.MAX_UPLOAD_MB * 1024 * 1024),
    maxDocumentsPerJob: e.MAX_DOCUMENTS_PER_JOB,
    maxCopies: e.MAX_COPIES,
    uploadsPerMinute: e.UPLOADS_PER_MINUTE,
    jobTtlMs: e.JOB_TTL_HOURS * 3_600_000,
    retentionMs: e.RETENTION_DAYS * 86_400_000,
    passcode: e.AUTHORIZATION_QUERY
      ? {
          query: e.AUTHORIZATION_QUERY,
          host: e.AUTH_DB_HOST,
          port: e.AUTH_DB_PORT,
          user: e.AUTH_DB_USER!,
          password: e.AUTH_DB_PASSWORD,
          database: e.AUTH_DB_NAME!,
        }
      : undefined,
    entra:
      e.ENTRA_TENANT_ID && e.ENTRA_CLIENT_ID && e.ENTRA_CLIENT_SECRET
        ? {
            tenantId: e.ENTRA_TENANT_ID,
            clientId: e.ENTRA_CLIENT_ID,
            clientSecret: e.ENTRA_CLIENT_SECRET,
            adminGroupIds: e.ENTRA_ADMIN_GROUP_IDS,
            adminEmails: e.ENTRA_ADMIN_EMAILS.map((email) =>
              email.toLowerCase(),
            ),
          }
        : undefined,
    session: e.SESSION_SECRET
      ? {
          secret: e.SESSION_SECRET,
          ttlMs: e.SESSION_HOURS * 3_600_000,
        }
      : undefined,
  };
}
