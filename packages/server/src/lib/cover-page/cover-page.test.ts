import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { addCoverPage } from './cover-page.js';

async function sourcePdf(pages: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i++) document.addPage([300 + i * 10, 400]);
  return document.save();
}

const options = {
  siteTitle: 'VITA Secure Print',
  printerName: 'Main Office',
  title: 'Jane Doe 555-0100',
  documents: [
    { titleOrFilename: 'W-2.jpg', copies: 2 },
    { titleOrFilename: 'driver license.heic', copies: 1 },
  ],
  submittedAt: new Date('2026-10-26T18:00:00Z'),
  timeZone: 'America/Denver',
};

describe('cover page', () => {
  it('lists documents in order with separate copy counts', async () => {
    const pdf = await PDFDocument.load(await addCoverPage(await sourcePdf(2), options));
    const contents = pdf.getPage(0).node.Contents();
    const references = contents instanceof PDFArray ? contents.asArray() : [contents];
    const content = references
      .map((reference) =>
        Buffer.from(
          decodePDFRawStream(pdf.context.lookup(reference) as PDFRawStream).decode(),
        ).toString('latin1'),
      )
      .join('\n');
    const encoded = (text: string) => Buffer.from(text, 'latin1').toString('hex').toUpperCase();
    expect(content).toContain(encoded('W-2.jpg'));
    expect(content).toContain(encoded('2 copies'));
    expect(content).toContain(encoded('driver license.heic'));
    expect(content).toContain(encoded('1 copy'));
    expect(content.indexOf(encoded('W-2.jpg'))).toBeLessThan(
      content.indexOf(encoded('driver license.heic')),
    );
  });

  it('puts a letter-size cover sheet ahead of the original pages, unchanged', async () => {
    const result = await PDFDocument.load(await addCoverPage(await sourcePdf(2), options));
    expect(result.getPageCount()).toBe(3);
    expect(result.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(result.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
    expect(result.getPage(2).getSize()).toEqual({ width: 310, height: 400 });
  });

  it('copes with titles outside the standard PDF font character set', async () => {
    await expect(
      addCoverPage(await sourcePdf(1), { ...options, title: 'Łukasz 📄 ' + 'x'.repeat(100) }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('rejects input that is not a PDF', async () => {
    await expect(addCoverPage(Buffer.from('not a pdf'), options)).rejects.toThrow();
  });
});
