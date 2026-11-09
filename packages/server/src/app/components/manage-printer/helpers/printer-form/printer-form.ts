import type {
  PrinterInput,
  PrinterSummary,
} from '../../../../services/printer/printer.service';

export const NAME_MAX_LENGTH = 100;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type PrinterModel = PrinterInput;

export const emptyPrinterModel = (): PrinterModel => ({
  name: '',
  slug: '',
  queue: '',
  coverPage: false,
});

export const toPrinterModel = (
  printer: PrinterSummary,
): PrinterModel => ({
  name: printer.name,
  slug: printer.slug,
  queue: printer.queue,
  coverPage: printer.coverPage,
});

/** Title of the management page, following the name being edited. */
export const printerPageTitle = (name: string): string =>
  name ? `Manage ${name}` : 'Manage Printer';
