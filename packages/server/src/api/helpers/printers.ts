import { $, type PrinterInput } from '@uwacwy/print-shared';

import type { Principal } from '../middleware/auth/principal';
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

export interface PrinterStats {
  activeJobs: number;
  failedJobs: number;
  online: boolean;
}

/** Operational status for applications; deliberately never includes the PIN. */
export const printerStatus = (
  printer: PrinterRow,
  { activeJobs, failedJobs, online }: PrinterStats,
) => ({
  ...publicPrinter(printer),
  activeJobs,
  failedJobs,
  lastSeenAt: printer.last_seen_at,
  online,
  pinEnabled: printer.pin !== null,
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

/**
 * How a caller sees a printer. Only signed-in people (`entraUser`) ever receive the PIN, so a
 * leaked application credential cannot reveal it.
 */
export const printerView = (
  who: Principal | undefined,
  printer: PrinterRow,
  stats: () => PrinterStats,
) => {
  switch (who?.kind) {
    case 'entraApp':
      return printerStatus(printer, stats());
    case 'entraUser': {
      const { activeJobs, failedJobs, online } = stats();
      return managedPrinter(
        printer,
        activeJobs,
        failedJobs,
        online,
      );
    }
    default:
      return publicPrinter(printer);
  }
};

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
