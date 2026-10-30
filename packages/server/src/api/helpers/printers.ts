import { z } from 'zod';
import {
  validatePrinterFields,
  type PrinterRow,
} from './database/database';
import { formatPin } from '../middleware/auth/pin/pin';

const printerInput = z.object({
  slug: z.string(),
  name: z.string(),
  queue: z.string(),
  coverPage: z.boolean().optional().default(false),
});

/** Fields anyone may see. */
export const publicPrinter = (printer: PrinterRow) => ({
  slug: printer.slug,
  name: printer.name,
  coverPage: printer.cover_page === 1,
});

/** Fields for administrators. */
export const managedPrinter = (
  printer: PrinterRow,
  activeJobs: number,
  online: boolean,
) => ({
  ...publicPrinter(printer),
  id: printer.id,
  queue: printer.queue,
  pin: printer.pin ? formatPin(printer.pin) : null,
  qrEpoch: printer.qr_epoch,
  lastSeenAt: printer.last_seen_at,
  activeJobs,
  online,
});

export function validatePrinterInput(input: unknown) {
  const parsed = printerInput.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid printer fields.' } as const;
  }
  const fields = validatePrinterFields({
    slug: parsed.data.slug,
    name: parsed.data.name,
    queue: parsed.data.queue,
    cover_page: parsed.data.coverPage,
  });
  return typeof fields === 'string'
    ? ({ error: fields } as const)
    : ({ fields } as const);
}

/** SPA path of a printer's upload page, optionally carrying an upload token. */
export const printPath = (
  printer: Pick<PrinterRow, 'slug'>,
  token?: string,
) =>
  `/print/${encodeURIComponent(printer.slug)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
