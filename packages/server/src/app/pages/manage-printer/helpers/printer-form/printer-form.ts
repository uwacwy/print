import {
  type PrinterInput,
  type PrinterSummary,
} from '@uwacwy/print-shared';

export type PrinterModel = PrinterInput;

export const emptyPrinterModel = (): PrinterModel => ({
  coverPage: false,
  name: '',
  queue: '',
  slug: '',
});

export const toPrinterModel = (
  printer: PrinterSummary,
): PrinterModel => ({
  coverPage: printer.coverPage,
  name: printer.name,
  queue: printer.queue,
  slug: printer.slug,
});

/** Title of the management page, following the name being edited. */
export const printerPageTitle = (name: string): string =>
  name
    ? $localize`:@@printer-form.title-named:Manage ${name}:name:`
    : $localize`:@@printer-form.title:Manage Printer`;
