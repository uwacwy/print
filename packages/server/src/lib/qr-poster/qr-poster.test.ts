import { inflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildQrPoster } from './qr-poster.js';

/** Text drawn on the first page; pdf-lib writes standard-font strings as hex. */
async function pageText(bytes: Uint8Array): Promise<string> {
  const page = (await PDFDocument.load(bytes)).getPage(0);
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray ? contents.asArray() : [contents];
  return streams
    .map((ref) => page.doc.context.lookup(ref))
    .filter(
      (stream): stream is PDFRawStream =>
        stream instanceof PDFRawStream,
    )
    .map((stream) => inflateSync(stream.contents).toString('latin1'))
    .join('\n')
    .replace(/<([0-9A-Fa-f]+)> Tj/g, (_, hex: string) =>
      Buffer.from(hex, 'hex').toString('latin1'),
    );
}

describe('QR poster', () => {
  it('renders a single letter-size page', async () => {
    const bytes = await buildQrPoster({
      siteTitle: 'VITA Secure Print',
      printerName: 'Main Office',
      url: 'https://print.example.org/p/main',
      date: new Date('2026-10-26T18:00:00Z'),
      timeZone: 'America/Denver',
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({
      width: 612,
      height: 792,
    });
    expect(document.getTitle()).toBe('Main Office - print QR code');
  });

  it('links the QR code and printed address to the full token URL', async () => {
    const url = 'https://print.example.org/print/main?token=a.b.c';
    const bytes = await buildQrPoster({
      siteTitle: 'Print',
      printerName: 'Main Office',
      url,
      displayUrl: 'https://print.example.org/print/main',
      date: new Date('2026-10-26T18:00:00Z'),
      validFrom: new Date('2026-10-26T18:00:00Z'),
      validUntil: new Date('2026-10-27T18:00:00Z'),
      timeZone: 'America/Denver',
    });
    const page = (await PDFDocument.load(bytes)).getPage(0);
    const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
    const uris = annots
      .asArray()
      .map((ref) => page.doc.context.lookup(ref, PDFDict))
      .map((annot) =>
        annot
          .lookup(PDFName.of('A'), PDFDict)
          .lookup(PDFName.of('URI'), PDFString),
      );
    expect(uris.map((uri) => uri.decodeText())).toEqual([url, url]);
  });

  it('prints the PIN only when one is set', async () => {
    const options = {
      siteTitle: 'Print',
      printerName: 'Main Office',
      url: 'https://print.example.org/print/main?token=a.b.c',
      date: new Date('2026-10-26T18:00:00Z'),
      validFrom: new Date('2026-10-26T18:00:00Z'),
      validUntil: new Date('2026-10-27T18:00:00Z'),
    };
    const withPin = await pageText(
      await buildQrPoster({ ...options, pin: '123-456-789' }),
    );
    expect(withPin).toContain('and enter PIN');
    expect(withPin).toContain('123-456-789');
    expect(withPin).toContain('This code works');
    expect(withPin).not.toMatch(/This code works[^\n]*\?/);

    const withoutPin = await pageText(
      await buildQrPoster({ ...options, pin: null }),
    );
    expect(withoutPin).not.toContain('enter PIN');
    expect(withoutPin).toContain('This code works');
  });

  it('tolerates names outside the standard PDF font character set', async () => {
    await expect(
      buildQrPoster({
        siteTitle: 'Print',
        printerName: 'Biblioteca 📚 Łódź',
        url: 'https://print.example.org/p/lib',
        date: new Date(),
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
