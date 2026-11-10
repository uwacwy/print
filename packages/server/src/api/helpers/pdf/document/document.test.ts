import heicConvert from 'heic-convert';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { addCoverPage } from '../cover-page/cover-page';
import {
  combineDocuments,
  maxImagePixels,
  normalizeDocument,
} from './document';

vi.mock('heic-convert', () => ({ default: vi.fn() }));

const solid = (width: number, height: number) =>
  sharp({
    create: {
      background: '#28a745',
      channels: 3,
      height,
      width,
    },
  });

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
    ...text.matchAll(
      /([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/g,
    ),
  ].map((match) => match.slice(1).map(Number));
  const [, , x, y] = matrices.find(([, , x, y]) => x || y)!;
  const [width, height] = matrices.find(
    ([w, h]) => w !== 1 || h !== 1,
  )!;
  return { height, width, x, y };
}

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
      height: number(stream, 'Height'),
      width: number(stream, 'Width'),
    }));
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
        background: '#28a745',
        channels: 3,
        height: 200,
        width: 320,
      },
    })
      .jpeg()
      .toBuffer();
    const result = await normalizeDocument(image);
    const document = await PDFDocument.load(result.pdf);
    expect(result.mime).toBe('image/jpeg');
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({
      height: 792,
      width: 612,
    });
  });

  it('caps images at 7.5 × 10 in worth of pixels, 150 dpi by default', async () => {
    expect(maxImagePixels(150)).toEqual({
      height: 1500,
      width: 1125,
    });
    const landscape = await solid(3000, 2000).jpeg().toBuffer();
    const portrait = await solid(2000, 4000).png().toBuffer();

    expect(
      await embeddedImageSizes(
        (await normalizeDocument(landscape)).pdf,
      ),
    ).toEqual([{ height: 750, width: 1125 }]);
    expect(
      await embeddedImageSizes(
        (await normalizeDocument(portrait)).pdf,
      ),
    ).toEqual([{ height: 1500, width: 750 }]);
  });

  it('downsamples to a configurable DPI without enlarging small images', async () => {
    const large = await solid(3000, 2000).jpeg().toBuffer();
    const small = await solid(320, 200).jpeg().toBuffer();

    expect(
      await embeddedImageSizes(
        (await normalizeDocument(large, { imageDpi: 100 })).pdf,
      ),
    ).toEqual([{ height: 500, width: 750 }]);
    expect(
      await embeddedImageSizes(
        (await normalizeDocument(small, { imageDpi: 300 })).pdf,
      ),
    ).toEqual([{ height: 200, width: 320 }]);
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
      height: 360,
      width: 540,
      x: 36,
      y: 216,
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
      { height: 360, width: 540 },
      { height: 360, width: 540 },
    ]);
  });

  it('combines documents in upload order and adds one cover page for the job', async () => {
    const first = await PDFDocument.create();
    first.addPage([300, 400]);
    const jpeg = await sharp({
      create: {
        background: '#28a745',
        channels: 3,
        height: 200,
        width: 320,
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
      height: 400,
      width: 300,
    });
    expect(mergedDocument.getPage(1).getSize()).toEqual({
      height: 400,
      width: 300,
    });
    expect(mergedDocument.getPage(2).getSize()).toEqual({
      height: 792,
      width: 612,
    });

    const covered = await addCoverPage(merged, {
      documents: [
        { copies: 2, titleOrFilename: 'first.pdf' },
        { copies: 1, titleOrFilename: 'image.jpg' },
      ],
      printerName: 'Main Office',
      siteTitle: 'VITA Secure Print',
      submittedAt: new Date('2026-10-27T18:00:00Z'),
      timeZone: 'America/Denver',
      title: 'Kovach documents',
    });
    const coveredDocument = await PDFDocument.load(covered);
    expect(coveredDocument.getPageCount()).toBe(4);
    expect(coveredDocument.getPage(0).getSize()).toEqual({
      height: 792,
      width: 612,
    });
    expect(coveredDocument.getPage(1).getSize()).toEqual({
      height: 400,
      width: 300,
    });
    expect(coveredDocument.getPage(2).getSize()).toEqual({
      height: 400,
      width: 300,
    });
    expect(coveredDocument.getPage(3).getSize()).toEqual({
      height: 792,
      width: 612,
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
        { copies: 1, titleOrFilename: 'first.pdf' },
        { copies: 1, titleOrFilename: 'second.pdf' },
      ],
      printerName: 'Main Office',
      siteTitle: 'VITA Secure Print',
      submittedAt: new Date(),
      title: 'A hundred pages',
    });
    expect(
      (await PDFDocument.load(covered)).getPageCount(),
    ).toBe(101);
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
        background: '#28a745',
        channels: 3,
        height: 200,
        width: 320,
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
      height: 792,
      width: 612,
    });
  });

  it('rejects unknown file types and encrypted or empty PDFs', async () => {
    await expect(
      normalizeDocument(Buffer.from('not a document')),
    ).rejects.toThrow(/PDF, JPEG, PNG, or HEIC/);
  });
});
