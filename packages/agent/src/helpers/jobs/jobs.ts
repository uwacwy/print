import type { DownloadHeaders, PrinterOptions } from '../../types';
import { acceptsMimeType } from '../options/options';

const JOB_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isJobId = (id: string): boolean => JOB_ID.test(id);

/** Rejects a download the printer can't take, before its body is read. */
export function checkDownloadHeaders(
  { contentType, contentLength }: DownloadHeaders,
  options: Pick<PrinterOptions, 'maxBytes' | 'mimeTypes'>,
): void {
  if (!acceptsMimeType(options, contentType)) {
    throw new Error(
      `Printer does not accept ${contentType ?? 'untyped documents'}.`,
    );
  }
  if (Number(contentLength ?? 0) > options.maxBytes) {
    throw new Error('Downloaded job exceeds the printer maxBytes.');
  }
}

/** Rejects a downloaded body that is too large or claims to be a PDF but isn't. */
export function checkDownloadedDocument(
  contentType: string | null,
  document: Buffer,
  options: Pick<PrinterOptions, 'maxBytes'>,
): Buffer {
  if (document.length > options.maxBytes) {
    throw new Error('Downloaded job exceeds the printer maxBytes.');
  }
  if (
    acceptsMimeType(
      { mimeTypes: ['application/pdf'] },
      contentType,
    ) &&
    document.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error('Downloaded job is not a valid PDF.');
  }
  return document;
}
