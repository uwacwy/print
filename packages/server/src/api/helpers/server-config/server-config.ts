import {
  type ClientConfig,
  serverOrigin,
} from '@uwacwy/print-shared';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

import type { EntraUserOptions } from '../../middleware/auth/entra-user/entra-user.strategy';

import {
  DEFAULT_UPLOAD_TOKEN_ISSUER,
  type UploadTokenKey,
} from '../../middleware/auth/upload-token/upload-token';
import { parseBrandLinks } from '../brand-links/brand-links';

/** Shown until SITE_TITLE is set, so an unconfigured server is obvious. */
export const DEFAULT_SITE_TITLE = 'Update env:SITE_TITLE';
/** Shown until ORG_NAME is set, so an unconfigured server is obvious. */
export const DEFAULT_ORG_NAME = 'Update env:ORG_NAME';
export const DEFAULT_PUBLIC_URL = 'https://localhost:4200';

const ServerEnvironment = z.object({
  /** Days of daily access logs kept in DATA_DIR/logs; 0 disables the access log. */
  ACCESS_LOG_DAYS: z.coerce.number().int().min(0).default(14),
  /** Footer links as a query string: `label=Privacy&url=https://example.com/privacy&label=...`. */
  CLIENT_BRAND_LINKS: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return value ? parseBrandLinks(value) : undefined;
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
        return z.NEVER;
      }
    }),
  /** Root-relative URL of the logo; when unset the server looks for `logo.{svg,png,jpg}` in the browser folder. */
  CLIENT_BRAND_LOGO: z.string().min(1).optional(),
  /** Former name of ORG_NAME, still read when ORG_NAME is unset. */
  CLIENT_LEGAL_ORG_NAME: z.string().min(1).optional(),
  /** Show the package name and version in the footer. */
  CLIENT_SHOW_ATTRIBUTION: z.stringbool().default(true),
  /** Relative paths resolve from the working directory. */
  DATA_DIR: z.string().default('data'),
  /** Lifetime of enrollment tokens that let a print agent add its own printer. */
  ENROLL_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(30),
  ENTRA_ADMIN_GROUP_IDS: z.string().optional(),
  ENTRA_ADMIN_ROLE: z.string().min(1).optional(),
  ENTRA_ADMIN_SCOPE: z
    .string()
    .min(1)
    .default('Printers.Manage'),
  ENTRA_API_AUDIENCE: z.string().min(1).optional(),
  ENTRA_CLIENT_ID: z.string().uuid().optional(),
  ENTRA_TENANT_ID: z.string().uuid().optional(),
  /** Uploaded photos are downsampled to this resolution over a 7.5 × 10 in area. */
  IMAGE_DPI: z.coerce
    .number()
    .int()
    .min(72)
    .max(600)
    .default(150),
  JOB_TTL_HOURS: z.coerce.number().positive().default(24),
  /** Text alternative for the header logo (`logo.{svg,png,jpg}` in the browser folder); defaults to ORG_NAME. */
  LOGO_ALT: z.string().min(1).optional(),
  MAX_COPIES: z.coerce.number().int().min(1).max(5).default(5),
  MAX_DOCUMENTS_PER_JOB: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),
  MAX_UPLOAD_MB: z.coerce
    .number()
    .positive()
    .max(100)
    .default(20),
  /** Organization named in the footer copyright notice and the default logo text alternative. */
  ORG_NAME: z.string().min(1).optional(),
  /** Wrong PIN attempts allowed per client and printer every 15 minutes. */
  PIN_MAX_FAILURES: z.coerce.number().int().min(1).default(3),
  /** Each client (IP) may exchange a PIN for a token at most once per this many minutes. */
  PIN_TOKEN_INTERVAL_MINUTES: z.coerce
    .number()
    .positive()
    .default(10),
  /** Lifetime of the token issued in exchange for a printer PIN. */
  PIN_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .positive()
    .default(10),
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Canonical public origin for QR posters (defaults to the request's origin). Also the server URL
   * in agent install commands and scripts, which are only offered when it is https (or loopback http).
   */
  PUBLIC_URL: z.url().default(DEFAULT_PUBLIC_URL),
  /** IPv6 clients are rate limited per subnet of this size, so address rotation cannot evade limits. */
  RATE_LIMIT_IPV6_SUBNET: z.coerce
    .number()
    .int()
    .min(32)
    .max(64)
    .default(56),
  RETENTION_DAYS: z.coerce.number().positive().default(7),
  SITE_TITLE: z.string().min(1).default(DEFAULT_SITE_TITLE),
  TIME_ZONE: z.string().default('America/Denver'),
  /** `true`/`false`, or a comma-separated list of trusted proxy addresses or Express presets. */
  TRUST_PROXY: z
    .string()
    .transform((v) =>
      v === 'true'
        ? true
        : v === 'false'
          ? false
          : v.split(',').map((item) => item.trim()),
    )
    .default(['loopback', 'linklocal', 'uniquelocal']),
  /** Longest validity window an admin may give a QR token. */
  UPLOAD_TOKEN_MAX_DAYS: z.coerce
    .number()
    .positive()
    .default(365),
  /** HS256 key that signs upload tokens (QR codes and PIN exchanges); changing it revokes them all. */
  UPLOAD_TOKEN_SECRET: z
    .string({
      error:
        'UPLOAD_TOKEN_SECRET is required (generate with: openssl rand -base64 48).',
    })
    .min(
      32,
      'UPLOAD_TOKEN_SECRET must be at least 32 characters.',
    ),
  UPLOADS_PER_MINUTE: z.coerce.number().int().min(1).default(10),
});

export interface EnrollmentConfig {
  /** `PUBLIC_URL` origin agents connect to; undefined disables enrollment and install commands. */
  serverUrl: string | undefined;
  tokenTtlMinutes: number;
}

export interface ServerConfig {
  /** Undefined when ACCESS_LOG_DAYS is 0. */
  accessLog: undefined | { dir: string; maxDays: number };
  /** Served to the browser by `GET /api/client-config`. */
  client: ClientConfig;
  dataDir: string;
  enrollment: EnrollmentConfig;
  entra: EntraUserOptions;
  jobTtlMs: number;
  logoAlt: string;
  port: number;
  publicUrl: URL;
  retentionMs: number;
  trustProxy: boolean | string[];
  upload: UploadConfig;
}

export interface UploadAccessConfig extends UploadTokenKey {
  ipv6Subnet: number;
  pinMaxFailures: number;
  pinTokenIntervalMs: number;
  pinTokenTtlMs: number;
  tokenMaxLifetimeMs: number;
}

export interface UploadConfig {
  access: UploadAccessConfig;
  /** Resolution uploaded images are downsampled to; see `normalizeDocument`. */
  imageDpi: number;
  maxCopies: number;
  maxDocumentsPerJob: number;
  maxUploadBytes: number;
  siteTitle: string;
  timeZone: string;
  uploadsPerMinute: number;
}

type ServerEnvironment = z.infer<typeof ServerEnvironment>;

/** Env files tried, relative to the working directory, when `PRINT_ENV_FILE` is unset. */
const DEFAULT_ENV_FILES = ['.env', 'packages/server/.env'];

/** True when this module is being served by the Angular dev server (`ng serve`). */
export function isAngularDevServer(
  argv: readonly string[] = process.argv,
): boolean {
  return (
    /(^|[\\/])ng(\.js)?$/.test(argv[1] ?? '') &&
    ['dev', 's', 'serve'].includes(argv[2] ?? '')
  );
}

/**
 * Loads local settings from `PRINT_ENV_FILE`, else the first of `.env` (an installed server) or
 * `packages/server/.env` (the repo root, so a bare `ng serve` behaves like `npm run start:server`).
 * Variables already present in the environment win. Container images configure the environment
 * directly and ship without an env file.
 */
export function loadLocalEnvFile(
  env: NodeJS.ProcessEnv = process.env,
  file = resolve(
    env['PRINT_ENV_FILE'] ??
      DEFAULT_ENV_FILES.find((candidate) =>
        existsSync(candidate),
      ) ??
      DEFAULT_ENV_FILES[0],
  ),
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

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
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
  const serverUrl = serverOrigin(e.PUBLIC_URL);
  const publicUrl = new URL(e.PUBLIC_URL);
  return {
    accessLog: e.ACCESS_LOG_DAYS
      ? {
          dir: resolve(e.DATA_DIR, 'logs'),
          maxDays: e.ACCESS_LOG_DAYS,
        }
      : undefined,
    client: toClientConfig(e),
    dataDir: resolve(e.DATA_DIR),
    enrollment: {
      serverUrl,
      tokenTtlMinutes: e.ENROLL_TOKEN_TTL_MINUTES,
    },
    entra: {
      adminGroupIds: splitList(e.ENTRA_ADMIN_GROUP_IDS),
      adminRole: e.ENTRA_ADMIN_ROLE,
      audience: apiAudience,
      requiredScope: e.ENTRA_ADMIN_SCOPE,
      tenantId: e.ENTRA_TENANT_ID,
    },
    jobTtlMs: e.JOB_TTL_HOURS * 3_600_000,
    logoAlt: e.LOGO_ALT ?? orgName(e),
    port: e.PORT,
    publicUrl,
    retentionMs: e.RETENTION_DAYS * 86_400_000,
    trustProxy: e.TRUST_PROXY,
    upload: {
      access: {
        ipv6Subnet: e.RATE_LIMIT_IPV6_SUBNET,
        pinMaxFailures: e.PIN_MAX_FAILURES,
        pinTokenIntervalMs:
          e.PIN_TOKEN_INTERVAL_MINUTES * 60_000,
        pinTokenTtlMs: e.PIN_TOKEN_TTL_MINUTES * 60_000,
        // The app's client ID names both who issued an upload token and who accepts it.
        tokenIssuer:
          e.ENTRA_CLIENT_ID ?? DEFAULT_UPLOAD_TOKEN_ISSUER,
        tokenMaxLifetimeMs: e.UPLOAD_TOKEN_MAX_DAYS * 86_400_000,
        tokenSecret: e.UPLOAD_TOKEN_SECRET,
      },
      imageDpi: e.IMAGE_DPI,
      maxCopies: e.MAX_COPIES,
      maxDocumentsPerJob: e.MAX_DOCUMENTS_PER_JOB,
      maxUploadBytes: Math.floor(e.MAX_UPLOAD_MB * 1024 * 1024),
      siteTitle: e.SITE_TITLE,
      timeZone: e.TIME_ZONE,
      uploadsPerMinute: e.UPLOADS_PER_MINUTE,
    },
  };
}

/**
 * The server's own version from its package.json (agents are released in lockstep), or
 * undefined when the file is not where an installed or built server keeps it.
 */
export function readServerVersion(
  file: string,
): string | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    name?: unknown;
    version?: unknown;
  };
  return manifest.name === '@uwacwy/print-server' &&
    typeof manifest.version === 'string'
    ? manifest.version
    : undefined;
}

/** ORG_NAME, else its former name CLIENT_LEGAL_ORG_NAME, else a reminder to set it. */
function orgName(
  e: Pick<
    ServerEnvironment,
    'CLIENT_LEGAL_ORG_NAME' | 'ORG_NAME'
  >,
): string {
  return (
    e.ORG_NAME ?? e.CLIENT_LEGAL_ORG_NAME ?? DEFAULT_ORG_NAME
  );
}

/** The browser-safe subset of the server's settings, served by `GET /api/client-config`. */
export function toClientConfig(
  e: Pick<
    ServerEnvironment,
    | 'CLIENT_BRAND_LINKS'
    | 'CLIENT_BRAND_LOGO'
    | 'CLIENT_LEGAL_ORG_NAME'
    | 'CLIENT_SHOW_ATTRIBUTION'
    | 'ENTRA_ADMIN_SCOPE'
    | 'ENTRA_API_AUDIENCE'
    | 'ENTRA_CLIENT_ID'
    | 'ENTRA_TENANT_ID'
    | 'LOGO_ALT'
    | 'ORG_NAME'
    | 'PUBLIC_URL'
    | 'SITE_TITLE'
  >,
): ClientConfig {
  return {
    site: {
      links: e.CLIENT_BRAND_LINKS,
      logo: e.CLIENT_BRAND_LOGO
        ? {
            alt: e.LOGO_ALT ?? orgName(e),
            src: e.CLIENT_BRAND_LOGO,
          }
        : undefined,
      title: e.SITE_TITLE,
      organizationName: orgName(e),
      url: e.PUBLIC_URL,
      showAttribution: e.CLIENT_SHOW_ATTRIBUTION,
    },
    enrollment: !!serverOrigin(e.PUBLIC_URL),
    legal: { organizationName: orgName(e) },
    publicUrl: new URL(e.PUBLIC_URL).href,
    showAttribution: e.CLIENT_SHOW_ATTRIBUTION,
    ...(e.ENTRA_TENANT_ID &&
      e.ENTRA_CLIENT_ID && {
        msal: {
          apiScope: `${e.ENTRA_API_AUDIENCE ?? `api://${e.ENTRA_CLIENT_ID}`}/${e.ENTRA_ADMIN_SCOPE}`,
          authority: `https://login.microsoftonline.com/${e.ENTRA_TENANT_ID}`,
          clientId: e.ENTRA_CLIENT_ID,
          tenantId: e.ENTRA_TENANT_ID,
        },
      }),
  } satisfies ClientConfig;
}
