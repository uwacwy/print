import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { addCoverPage } from '../cover-page/cover-page';
import { combineDocuments, normalizeDocument } from './document';

vi.mock('heic-convert', () => ({ default: vi.fn() }));

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
