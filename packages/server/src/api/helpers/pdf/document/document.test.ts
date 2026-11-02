import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { addCoverPage } from '../cover-page/cover-page';
import {
  combineDocuments,
  maxImagePixels,
  normalizeDocument,
} from './document';

vi.mock('heic-convert', () => ({ default: vi.fn() }));

const solid = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#28a745' },
  });

/** Pixel size of each image XObject embedded in a PDF. */
async function embeddedImageSizes(pdf: Uint8Array) {
  const document = await PDFDocument.load(pdf);
  const number = (stream: PDFRawStream, key: string) =>
    stream.dict.lookup(PDFName.of(key), PDFNumber).asNumber();
  return document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFRawStream =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of('Subtype')) ===
          PDFName.of('Image'),
    )
    .map((stream) => ({
      width: number(stream, 'Width'),
      height: number(stream, 'Height'),
    }));
}

/** Where the image is drawn on the first page, in points, from its `cm` operators. */
async function drawnImageBox(pdf: Uint8Array) {
  const document = await PDFDocument.load(pdf);
  const contents = document.getPage(0).node.Contents()!;
  const first =
    contents instanceof PDFArray ? contents.get(0) : contents;
  const stream = document.context.lookup(first);
  if (!(stream instanceof PDFRawStream)) {
    throw new Error('Expected an encoded page content stream.');
  }
  const text = Buffer.from(
    decodePDFRawStream(stream).decode(),
  ).toString('latin1');
  // pdf-lib's drawImage emits `1 0 0 1 x y cm` (position) then `w 0 0 h 0 0 cm` (size).
  const matrices = [
    ...text.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/g),
  ].map((match) => match.slice(1).map(Number));
  const [, , x, y] = matrices.find(([, , x, y]) => x || y)!;
  const [width, height] = matrices.find(
    ([w, h]) => w !== 1 || h !== 1,
  )!;
  return { x, y, width, height };
}

describe('document normalization', () => {
  it('passes validated PDFs through unchanged', async () => {
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    const source = Buffer.from(await document.save());
    const result = await normalizeDocument(source);
    expect(result.mime).toBe('application/pdf');
    expect(result.pdf).toEqual(source);
  });

  it('converts JPEG uploads to a letter-sized PDF', async () => {
    const image = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: '#28a745',
      },
    })
      .jpeg()
      .toBuffer();
    const result = await normalizeDocument(image);
    const document = await PDFDocument.load(result.pdf);
    expect(result.mime).toBe('image/jpeg');
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({
      width: 612,
      height: 792,
    });
  });

  it('caps images at 7.5 × 10 in worth of pixels, 150 dpi by default', async () => {
    expect(maxImagePixels(150)).toEqual({
      width: 1125,
      height: 1500,
    });
    const landscape = await solid(3000, 2000).jpeg().toBuffer();
    const portrait = await solid(2000, 4000).png().toBuffer();

    expect(
      await embeddedImageSizes(
        (await normalizeDocument(landscape)).pdf,
      ),
    ).toEqual([{ width: 1125, height: 750 }]);
    expect(
      await embeddedImageSizes(
        (await normalizeDocument(portrait)).pdf,
      ),
    ).toEqual([{ width: 750, height: 1500 }]);
  });

  it('downsamples to a configurable DPI without enlarging small images', async () => {
    const large = await solid(3000, 2000).jpeg().toBuffer();
    const small = await solid(320, 200).jpeg().toBuffer();

    expect(
      await embeddedImageSizes(
        (await normalizeDocument(large, { imageDpi: 100 })).pdf,
      ),
    ).toEqual([{ width: 750, height: 500 }]);
    expect(
      await embeddedImageSizes(
        (await normalizeDocument(small, { imageDpi: 300 })).pdf,
      ),
    ).toEqual([{ width: 320, height: 200 }]);
    await expect(
      normalizeDocument(small, { imageDpi: 0 }),
    ).rejects.toThrow(/DPI/);
  });

  it('fits images to the 7.5 × 10 in printable area, centered on the page', async () => {
    const result = await normalizeDocument(
      await solid(3000, 2000).jpeg().toBuffer(),
    );
    // 7.5 in = 540 pt wide, so a 3:2 image is 360 pt tall, centered on 612 × 792 pt Letter.
    expect(await drawnImageBox(result.pdf)).toEqual({
      x: 36,
      y: 216,
      width: 540,
      height: 360,
    });
  });

  it('applies the image DPI to every document in a combined job', async () => {
    const large = await solid(3000, 2000).jpeg().toBuffer();
    const merged = await combineDocuments(
      [
        { buffer: large, copies: 1 },
        { buffer: large, copies: 1 },
      ],
      { imageDpi: 72 },
    );
    expect(await embeddedImageSizes(merged)).toEqual([
      { width: 540, height: 360 },
      { width: 540, height: 360 },
    ]);
  });

  it('combines documents in upload order and adds one cover page for the job', async () => {
    const first = await PDFDocument.create();
    first.addPage([300, 400]);
    const jpeg = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: '#28a745',
      },
    })
      .jpeg()
      .toBuffer();

    const merged = await combineDocuments([
      { buffer: Buffer.from(await first.save()), copies: 2 },
      { buffer: jpeg, copies: 1 },
    ]);
    const mergedDocument = await PDFDocument.load(merged);
    expect(mergedDocument.getPageCount()).toBe(3);
    expect(mergedDocument.getPage(0).getSize()).toEqual({
      width: 300,
      height: 400,
    });
    expect(mergedDocument.getPage(1).getSize()).toEqual({
      width: 300,
      height: 400,
    });
    expect(mergedDocument.getPage(2).getSize()).toEqual({
      width: 612,
      height: 792,
    });

    const covered = await addCoverPage(merged, {
      documents: [
        { titleOrFilename: 'first.pdf', copies: 2 },
        { titleOrFilename: 'image.jpg', copies: 1 },
      ],
      siteTitle: 'VITA Secure Print',
      printerName: 'Main Office',
      title: 'Kovach documents',
      submittedAt: new Date('2026-10-27T18:00:00Z'),
      timeZone: 'America/Denver',
    });
    const coveredDocument = await PDFDocument.load(covered);
    expect(coveredDocument.getPageCount()).toBe(4);
    expect(coveredDocument.getPage(0).getSize()).toEqual({
      width: 612,
      height: 792,
    });
    expect(coveredDocument.getPage(1).getSize()).toEqual({
      width: 300,
      height: 400,
    });
    expect(coveredDocument.getPage(2).getSize()).toEqual({
      width: 300,
      height: 400,
    });
    expect(coveredDocument.getPage(3).getSize()).toEqual({
      width: 612,
      height: 792,
    });
  });

  it('allows 100 document pages plus one cover page', async () => {
    const makePdf = async (count: number) => {
      const document = await PDFDocument.create();
      for (let index = 0; index < count; index++) {
        document.addPage([300, 400]);
      }
      return Buffer.from(await document.save());
    };
    const oversized = await combineDocuments([
      { buffer: await makePdf(60), copies: 1 },
      { buffer: await makePdf(40), copies: 1 },
    ]);
    const covered = await addCoverPage(oversized, {
      documents: [
        { titleOrFilename: 'first.pdf', copies: 1 },
        { titleOrFilename: 'second.pdf', copies: 1 },
      ],
      siteTitle: 'VITA Secure Print',
      printerName: 'Main Office',
      title: 'A hundred pages',
      submittedAt: new Date(),
    });
    expect((await PDFDocument.load(covered)).getPageCount()).toBe(
      101,
    );
  });

  it('converts HEIC uploads through JPEG before creating a letter-sized PDF', async () => {
    const heic = Buffer.alloc(24);
    heic.writeUInt32BE(24, 0);
    heic.write('ftyp', 4, 'ascii');
    heic.write('heic', 8, 'ascii');
    heic.write('mif1', 16, 'ascii');
    heic.write('heic', 20, 'ascii');
    const jpeg = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: '#28a745',
      },
    })
      .jpeg()
      .toBuffer();
    vi.mocked(heicConvert).mockResolvedValue(jpeg);

    const result = await normalizeDocument(heic);
    const document = await PDFDocument.load(result.pdf);

    expect(result.mime).toBe('image/heic');
    expect(heicConvert).toHaveBeenCalledWith({
      buffer: heic,
      format: 'JPEG',
      quality: 1,
    });
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({
      width: 612,
      height: 792,
    });
  });

  it('rejects unknown file types and encrypted or empty PDFs', async () => {
    await expect(
      normalizeDocument(Buffer.from('not a document')),
    ).rejects.toThrow(/PDF, JPEG, PNG, or HEIC/);
  });
});
