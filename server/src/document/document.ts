import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import heicConvert from "heic-convert";

export type AcceptedMime =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/heic"
  | "image/heif"
  | "image/heic-sequence"
  | "image/heif-sequence";

const HEIC_MIMES = new Set<AcceptedMime>([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export async function normalizeDocument(
  buffer: Buffer,
): Promise<{ pdf: Buffer; mime: AcceptedMime }> {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime === "application/pdf") {
    const source = await PDFDocument.load(buffer, { updateMetadata: false });
    if (source.getPageCount() < 1 || source.getPageCount() > 100)
      throw new Error("PDF must contain between 1 and 100 pages.");
    return { pdf: buffer, mime: "application/pdf" };
  }
  const mime = detected?.mime as AcceptedMime | undefined;
  if (
    mime !== "image/jpeg" &&
    mime !== "image/png" &&
    (!mime || !HEIC_MIMES.has(mime))
  ) {
    throw new Error("Upload a PDF, JPEG, PNG, or HEIC document.");
  }

  const source = HEIC_MIMES.has(mime)
    ? Buffer.from(await heicConvert({ buffer, format: "JPEG", quality: 1 }))
    : buffer;
  const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("Unable to read image dimensions.");
  const oriented = await image.toBuffer();
  const pdf = await PDFDocument.create();
  const embedded =
    mime === "image/png"
      ? await pdf.embedPng(oriented)
      : await pdf.embedJpg(oriented);
  const page = pdf.addPage([612, 792]);
  const margin = 72;
  const scale = Math.min(
    (612 - margin * 2) / embedded.width,
    (792 - margin * 2) / embedded.height,
  );
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawImage(embedded, {
    x: (612 - width) / 2,
    y: (792 - height) / 2,
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
): Promise<Buffer> {
  if (documents.length === 0)
    throw new Error("Choose at least one document to print.");
  if (documents.length === 1 && documents[0]!.copies === 1)
    return (await normalizeDocument(documents[0]!.buffer)).pdf;

  const combined = await PDFDocument.create();
  let documentPageCount = 0;
  for (const document of documents) {
    if (
      !Number.isInteger(document.copies) ||
      document.copies < 1 ||
      document.copies > 5
    )
      throw new Error("Copies must be between 1 and 5 for each document.");
    const normalized = await normalizeDocument(document.buffer);
    const source = await PDFDocument.load(normalized.pdf, {
      updateMetadata: false,
    });
    documentPageCount += source.getPageCount();
    if (documentPageCount > 100)
      throw new Error("A print job cannot exceed 100 document pages.");
    for (let copy = 0; copy < document.copies; copy++) {
      const pages = await combined.copyPages(source, source.getPageIndices());
      for (const page of pages) combined.addPage(page);
    }
  }
  return Buffer.from(await combined.save());
}
