import { $, type PrinterInput } from '@uwacwy/print-shared';

import type {
  PrinterFields,
  PrinterRow,
} from './database/database';

import { formatPin } from '../middleware/auth/pin/pin';

/** Fields anyone may see. */
export const publicPrinter = (printer: PrinterRow) => ({
  coverPage: printer.cover_page === 1,
  name: printer.name,
  slug: printer.slug,
});

/** Fields for administrators. */
export const managedPrinter = (
  printer: PrinterRow,
  activeJobs: number,
  failedJobs: number,
  online: boolean,
) => ({
  ...publicPrinter(printer),
  activeJobs,
  failedJobs,
  id: printer.id,
  lastSeenAt: printer.last_seen_at,
  online,
  pin: printer.pin ? formatPin(printer.pin) : null,
  qrEpoch: printer.qr_epoch,
  queue: printer.queue,
});

/** A validated submission as the database stores it. */
export const toPrinterFields = (
  input: PrinterInput,
): PrinterFields => ({
  cover_page: input.coverPage,
  name: input.name,
  queue: input.queue,
  slug: input.slug,
});

/** SPA path of a printer's upload page, optionally carrying an upload token. */
export const printPath = (
  printer: Pick<PrinterRow, 'slug'>,
  token?: string,
) =>
  $.print.$slug(
    { slug: printer.slug },
    token ? { token } : undefined,
  );
