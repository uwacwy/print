import { z } from 'zod';

export const PRINTER_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const PRINTER_NAME_MAX_LENGTH = 100;

export const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    PRINTER_SLUG_PATTERN,
    'Slug must be lowercase letters, numbers, and hyphens (max 63).',
  );
export type Slug = z.infer<typeof Slug>;

const BAD_URI =
  'Printer URI must be a valid cups://, ipp://, ipps://, http://, or https:// URL.';

/** A CUPS destination (`cups://<queue_name>`) or an IPP/HTTP printer endpoint. */
export const PrinterQueue = z
  .string()
  .trim()
  .superRefine((queue, context) => {
    const uri = URL.parse(queue);
    const fail = (message: string) =>
      context.addIssue({ code: 'custom', message });
    if (!uri) {
      fail(BAD_URI);
    } else if (uri.protocol === 'cups:') {
      if (
        !/^[A-Za-z0-9_.-]{1,128}$/.test(uri.hostname) ||
        uri.pathname ||
        uri.port ||
        uri.search ||
        uri.hash ||
        uri.username ||
        uri.password
      ) {
        fail('CUPS destination must be cups://<queue_name>.');
      }
    } else if (
      !['http:', 'https:', 'ipp:', 'ipps:'].includes(
        uri.protocol,
      ) ||
      !uri.hostname ||
      uri.username ||
      uri.password ||
      !uri.pathname ||
      uri.pathname === '/'
    ) {
      fail(
        'Printer URI must use ipp://, ipps://, http://, or https:// and include a printer endpoint.',
      );
    }
  });
export type PrinterQueue = z.infer<typeof PrinterQueue>;

/** Printer fields an admin submits; whether the slug is already taken is checked against the database. */
export const PrinterInput = z.object({
  coverPage: z
    .union([
      z.boolean(),
      z.stringbool({
        falsy: ['0', 'false', 'off', ''],
        truthy: ['1', 'true', 'on'],
      }),
    ])
    .default(false),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(
      PRINTER_NAME_MAX_LENGTH,
      `Name is at most ${PRINTER_NAME_MAX_LENGTH} characters.`,
    ),
  queue: PrinterQueue,
  slug: Slug,
});
export type PrinterInput = z.infer<typeof PrinterInput>;

/** Printer fields as stored and listed; unlike `PrinterInput` these are not re-validated on the way out. */
const StoredPrinterFields = z.object({
  coverPage: z.boolean(),
  name: z.string(),
  queue: z.string(),
  slug: z.string(),
});

export const PrinterSummary = StoredPrinterFields.extend({
  activeJobs: z.number(),
  /** Failed jobs that still have their document and can be retried. */
  failedJobs: z.number(),
  id: z.number(),
  lastSeenAt: z.string().nullable(),
  online: z.boolean(),
  /** Formatted as ###-###-###, or null when PIN uploads are disabled. */
  pin: z.string().nullable(),
  qrEpoch: z.number(),
});
export type PrinterSummary = z.infer<typeof PrinterSummary>;

export const UploadTokenStatus = z.enum([
  'expired',
  'invalid',
  'not-yet-valid',
  'valid',
]);
export type UploadTokenStatus = z.infer<
  typeof UploadTokenStatus
>;

export const UploadAccess = z.object({
  pinEnabled: z.boolean(),
  /** True when the request carried a Microsoft Entra sign-in allowed to print without a PIN or token. */
  signedIn: z.boolean(),
  /** Verification result for the token sent with the request, or null when none was sent. */
  token: UploadTokenStatus.nullable(),
  tokenExpiresAt: z.string().nullable(),
});
export type UploadAccess = z.infer<typeof UploadAccess>;

export const UploadLimits = z.object({
  maxCopies: z.number(),
  maxDocuments: z.number(),
  maxUploadBytes: z.number(),
});
export type UploadLimits = z.infer<typeof UploadLimits>;

export const PublicPrinter = z.object({
  access: UploadAccess,
  coverPage: z.boolean(),
  name: z.string(),
  slug: z.string(),
  upload: UploadLimits,
});
export type PublicPrinter = z.infer<typeof PublicPrinter>;

export const CreatedPrinter = z.object({
  agentToken: z.string(),
  printer: PrinterSummary,
  /** `SITE_URL` origin for setup commands; null when the server has none. */
  serverUrl: z.string().nullable(),
});
export type CreatedPrinter = z.infer<typeof CreatedPrinter>;

export const DeletedJobs = z.object({
  deleted: z.number(),
  printer: PrinterSummary,
});
export type DeletedJobs = z.infer<typeof DeletedJobs>;

export const RetriedJobs = z.object({
  printer: PrinterSummary,
  retried: z.number(),
});
export type RetriedJobs = z.infer<typeof RetriedJobs>;
