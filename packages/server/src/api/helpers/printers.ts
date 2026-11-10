import { $ } from '@uwacwy/print-shared';
import { z } from 'zod';

import { formatPin } from '../middleware/auth/pin/pin';
import {
  type PrinterRow,
  validatePrinterFields,
} from './database/database';

const printerInput = z.object({
  coverPage: z.boolean().optional().default(false),
  name: z.string(),
  queue: z.string(),
  slug: z.string(),
});

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

export function validatePrinterInput(input: unknown) {
  const parsed = printerInput.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid printer fields.' } as const;
  }
  const fields = validatePrinterFields({
    cover_page: parsed.data.coverPage,
    name: parsed.data.name,
    queue: parsed.data.queue,
    slug: parsed.data.slug,
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
  $.print.$slug(
    { slug: printer.slug },
    token ? { token } : undefined,
  );
