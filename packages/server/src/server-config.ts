import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import type { EntraUserOptions } from './api/middleware/auth/entra-user/entra-user.strategy';
import {
  DEFAULT_UPLOAD_TOKEN_ISSUER,
  type UploadTokenKey,
} from './api/middleware/auth/upload-token/upload-token';

const ServerEnvironment = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATA_DIR: z
    .string()
    .default(join(import.meta.dirname, '../../../data')),
  /** Canonical public origin for QR posters; defaults to the request's origin. */
  PUBLIC_URL: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === ''
        ? undefined
        : value,
    z.string().url().optional(),
  ),
  SITE_TITLE: z.string().default('VITA Secure Print'),
  TIME_ZONE: z.string().default('America/Denver'),
  TRUST_PROXY: z.stringbool().default(false),
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
  /** HS256 key that signs upload tokens (QR codes and PIN exchanges); changing it revokes them all. */
  UPLOAD_TOKEN_SECRET: z
    .string({
      error:
        'UPLOAD_TOKEN_SECRET is required (generate with: openssl rand -base64 48).',
    })
    .min(32, 'UPLOAD_TOKEN_SECRET must be at least 32 characters.'),
  /** Longest validity window an admin may give a QR token. */
  UPLOAD_TOKEN_MAX_DAYS: z.coerce.number().positive().default(365),
  /** Lifetime of the token issued in exchange for a printer PIN. */
  PIN_TOKEN_TTL_MINUTES: z.coerce.number().positive().default(10),
  /** Each client (IP) may exchange a PIN for a token at most once per this many minutes. */
  PIN_TOKEN_INTERVAL_MINUTES: z.coerce
    .number()
    .positive()
    .default(10),
  /** Wrong PIN attempts allowed per client and printer every 15 minutes. */
  PIN_MAX_FAILURES: z.coerce.number().int().min(1).default(3),
  /** IPv6 clients are rate limited per subnet of this size, so address rotation cannot evade limits. */
  RATE_LIMIT_IPV6_SUBNET: z.coerce
    .number()
    .int()
    .min(32)
    .max(64)
    .default(56),
  ENTRA_TENANT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_ID: z.string().uuid().optional(),
  ENTRA_API_AUDIENCE: z.string().min(1).optional(),
  ENTRA_ADMIN_SCOPE: z.string().min(1).default('Printers.Manage'),
  ENTRA_ADMIN_GROUP_IDS: z.string().optional(),
  ENTRA_ADMIN_ROLE: z.string().min(1).optional(),
  /** Comma-separated client IDs of service apps (e.g. Windmill) allowed to submit print jobs. */
  ENTRA_AUTOMATION_CLIENT_IDS: z.string().optional(),
  ENTRA_AUTOMATION_ROLE: z.string().min(1).default('Jobs.Submit'),
  /** `ng serve` only: side port for socket.io, reached through proxy.conf.json. 0 disables it. */
  SOCKET_DEV_PORT: z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .optional(),
});

export interface UploadConfig {
  siteTitle: string;
  timeZone: string;
  maxUploadBytes: number;
  maxDocumentsPerJob: number;
  maxCopies: number;
  uploadsPerMinute: number;
  access: UploadAccessConfig;
}

export interface UploadAccessConfig extends UploadTokenKey {
  tokenMaxLifetimeMs: number;
  pinTokenTtlMs: number;
  pinTokenIntervalMs: number;
  pinMaxFailures: number;
  ipv6Subnet: number;
}

export interface ServerConfig {
  port: number;
  dataDir: string;
  trustProxy: boolean;
  publicUrl: URL | undefined;
  jobTtlMs: number;
  retentionMs: number;
  upload: UploadConfig;
  entra: EntraUserOptions;
  socketDevPort: number | undefined;
}

/**
 * Loads local settings (default `server/.env`, relative to the working directory) so a bare
 * `ng serve` behaves like `npm start`. Variables already present in the environment win.
 * Production images ship without this file and configure the process environment directly.
 */
export function loadLocalEnvFile(
  env: NodeJS.ProcessEnv = process.env,
  file = resolve(env['PRINT_ENV_FILE'] ?? 'server/.env'),
): void {
  if (!existsSync(file)) {
    return;
  }
  for (const [key, value] of Object.entries(
    parseEnv(readFileSync(file, 'utf8')),
  )) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

/** True when this module is being served by the Angular dev server (`ng serve`). */
export function isAngularDevServer(
  argv: readonly string[] = process.argv,
): boolean {
  return (
    /(^|[\\/])ng(\.js)?$/.test(argv[1] ?? '') &&
    ['serve', 's', 'dev'].includes(argv[2] ?? '')
  );
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
  devServer = isAngularDevServer(),
): ServerConfig {
  const e = ServerEnvironment.parse(env);
  const apiAudience =
    e.ENTRA_API_AUDIENCE ??
    (e.ENTRA_CLIENT_ID
      ? [e.ENTRA_CLIENT_ID, `api://${e.ENTRA_CLIENT_ID}`]
      : undefined);
  const splitList = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return {
    port: e.PORT,
    dataDir: e.DATA_DIR,
    trustProxy: e.TRUST_PROXY,
    publicUrl: e.PUBLIC_URL ? new URL(e.PUBLIC_URL) : undefined,
    jobTtlMs: e.JOB_TTL_HOURS * 3_600_000,
    retentionMs: e.RETENTION_DAYS * 86_400_000,
    upload: {
      siteTitle: e.SITE_TITLE,
      timeZone: e.TIME_ZONE,
      maxUploadBytes: Math.floor(e.MAX_UPLOAD_MB * 1024 * 1024),
      maxDocumentsPerJob: e.MAX_DOCUMENTS_PER_JOB,
      maxCopies: e.MAX_COPIES,
      uploadsPerMinute: e.UPLOADS_PER_MINUTE,
      access: {
        tokenSecret: e.UPLOAD_TOKEN_SECRET,
        // The app's client ID names both who issued an upload token and who accepts it.
        tokenIssuer:
          e.ENTRA_CLIENT_ID ?? DEFAULT_UPLOAD_TOKEN_ISSUER,
        tokenMaxLifetimeMs: e.UPLOAD_TOKEN_MAX_DAYS * 86_400_000,
        pinTokenTtlMs: e.PIN_TOKEN_TTL_MINUTES * 60_000,
        pinTokenIntervalMs: e.PIN_TOKEN_INTERVAL_MINUTES * 60_000,
        pinMaxFailures: e.PIN_MAX_FAILURES,
        ipv6Subnet: e.RATE_LIMIT_IPV6_SUBNET,
      },
    },
    entra: {
      tenantId: e.ENTRA_TENANT_ID,
      audience: apiAudience,
      requiredScope: e.ENTRA_ADMIN_SCOPE,
      adminRole: e.ENTRA_ADMIN_ROLE,
      adminGroupIds: splitList(e.ENTRA_ADMIN_GROUP_IDS),
    },
    socketDevPort:
      (e.SOCKET_DEV_PORT ?? (devServer ? 4201 : 0)) ||
      undefined,
  };
}
