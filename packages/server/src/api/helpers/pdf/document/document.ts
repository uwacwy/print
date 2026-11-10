import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import heicConvert from 'heic-convert';

export type AcceptedMime =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/heic'
  | 'image/heif'
  | 'image/heic-sequence'
  | 'image/heif-sequence';

const HEIC_MIMES = new Set<AcceptedMime>([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

/** US Letter, in PDF points (72 per inch). */
const PAGE = { width: 612, height: 792 } as const;
/** Area an image is fitted into, in inches: Letter with 0.5 in margins. */
const PRINTABLE_INCHES = { width: 7.5, height: 10 } as const;

export const DEFAULT_IMAGE_DPI = 150;

export interface NormalizeOptions {
  /**
   * Resolution images are downsampled to over the printable area, e.g. 150 dpi caps an image at
   * 1125 × 1500 px (7.5 × 10 in). Smaller images are never enlarged. PDFs pass through untouched.
   */
  imageDpi?: number;
}

/** Largest pixel box an image may occupy at `dpi` without exceeding the printable area. */
export function maxImagePixels(dpi: number): {
  width: number;
  height: number;
} {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError('Image DPI must be a positive number.');
  }
  return {
    width: Math.round(PRINTABLE_INCHES.width * dpi),
    height: Math.round(PRINTABLE_INCHES.height * dpi),
  };
}

export async function normalizeDocument(
  buffer: Buffer,
  { imageDpi = DEFAULT_IMAGE_DPI }: NormalizeOptions = {},
): Promise<{ pdf: Buffer; mime: AcceptedMime }> {
  const limit = maxImagePixels(imageDpi);
  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime === 'application/pdf') {
    const source = await PDFDocument.load(buffer, {
      updateMetadata: false,
    });
    if (source.getPageCount() < 1 || source.getPageCount() > 100) {
      throw new Error('PDF must contain between 1 and 100 pages.');
    }
    return { pdf: buffer, mime: 'application/pdf' };
  }
  const mime = detected?.mime as AcceptedMime | undefined;
  if (
    mime !== 'image/jpeg' &&
    mime !== 'image/png' &&
    (!mime || !HEIC_MIMES.has(mime))
  ) {
    throw new Error('Upload a PDF, JPEG, PNG, or HEIC document.');
  }

  const source = HEIC_MIMES.has(mime)
    ? Buffer.from(
        await heicConvert({ buffer, format: 'JPEG', quality: 1 }),
      )
    : buffer;
  const image = sharp(source, {
    limitInputPixels: 40_000_000,
  }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions.');
  }
  const oriented = await image
    .resize({
      ...limit,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();
  const pdf = await PDFDocument.create();
  const embedded =
    mime === 'image/png'
      ? await pdf.embedPng(oriented)
      : await pdf.embedJpg(oriented);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const scale = Math.min(
    (PRINTABLE_INCHES.width * 72) / embedded.width,
    (PRINTABLE_INCHES.height * 72) / embedded.height,
  );
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawImage(embedded, {
    x: (PAGE.width - width) / 2,
    y: (PAGE.height - height) / 2,
    width,
    height,
  });
  return { pdf: Buffer.from(await pdf.save()), mime };
}

export interface JobDocument {
  buffer: Buffer;
  copies: number;
}

export async function combineDocuments(
  documents: readonly JobDocument[],
  options: NormalizeOptions = {},
): Promise<Buffer> {
  if (documents.length === 0) {
    throw new Error('Choose at least one document to print.');
  }
  if (documents.length === 1 && documents[0].copies === 1) {
    return (await normalizeDocument(documents[0].buffer, options))
      .pdf;
  }

  const combined = await PDFDocument.create();
  let documentPageCount = 0;
  for (const document of documents) {
    if (
      !Number.isInteger(document.copies) ||
      document.copies < 1 ||
      document.copies > 5
    ) {
      throw new Error(
        'Copies must be between 1 and 5 for each document.',
      );
    }
    const normalized = await normalizeDocument(
      document.buffer,
      options,
    );
    const source = await PDFDocument.load(normalized.pdf, {
      updateMetadata: false,
    });
    documentPageCount += source.getPageCount();
    if (documentPageCount > 100) {
      throw new Error(
        'A print job cannot exceed 100 document pages.',
      );
    }
    for (let copy = 0; copy < document.copies; copy++) {
      const pages = await combined.copyPages(
        source,
        source.getPageIndices(),
      );
      for (const page of pages) {
        combined.addPage(page);
      }
    }
  }
  return Buffer.from(await combined.save());
}
