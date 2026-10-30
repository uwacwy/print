import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  BLACK,
  drawCentered,
  drawTwoColumnTable,
  GRAY,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  winAnsi,
} from '../pdf-layout.js';

export interface CoverPageOptions {
  siteTitle: string;
  printerName: string;
  title: string;
  submittedAt: Date;
  timeZone?: string;
  documents: { titleOrFilename: string; copies: number }[];
}

export const inflect = (
  count: number,
  singular: string,
  plural = `${singular}s`,
) => `${count} ${count === 1 ? singular : plural}`;

/** Returns the document with a confidential cover sheet as its first page. */
export async function addCoverPage(
  source: Uint8Array,
  options: CoverPageOptions,
): Promise<Uint8Array> {
  const srcPdf = await PDFDocument.load(source, {
    updateMetadata: false,
  });
  const pageCount = srcPdf.getPageCount();
  const dstPdf = await PDFDocument.create();
  dstPdf.setTitle(winAnsi(options.title));
  const cover = dstPdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helveticaRegular = await dstPdf.embedFont(
    StandardFonts.Helvetica,
  );
  const helveticaBold = await dstPdf.embedFont(
    StandardFonts.HelveticaBold,
  );

  const submitted = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: options.timeZone,
  }).format(options.submittedAt);

  drawCentered(
    cover,
    options.siteTitle,
    helveticaRegular,
    18,
    PAGE_HEIGHT - MARGIN - 18,
    GRAY,
  );
  drawCentered(cover, 'CONFIDENTIAL', helveticaBold, 54, 560);
  drawCentered(
    cover,
    'Contains personal information',
    helveticaRegular,
    22,
    522,
  );
  cover.drawLine({
    start: { x: MARGIN, y: 480 },
    end: { x: PAGE_WIDTH - MARGIN, y: 480 },
    thickness: 1,
    color: GRAY,
  });
  drawCentered(cover, 'DOCUMENT', helveticaRegular, 12, 440, GRAY);
  drawCentered(cover, options.title, helveticaBold, 30, 405);
  drawCentered(
    cover,
    `Submitted ${submitted}`,
    helveticaRegular,
    16,
    360,
    GRAY,
  );
  drawCentered(
    cover,
    inflect(pageCount, 'page'),
    helveticaRegular,
    16,
    335,
    GRAY,
  );

  if (options.documents.length) {
    const tableBottom = drawTwoColumnTable(
      cover,
      ['Document', 'Copies'],
      options.documents.map((item) => [
        item.titleOrFilename,
        inflect(item.copies, 'copy', 'copies'),
      ]),
      { regular: helveticaRegular, bold: helveticaBold },
      {
        width: 400,
        headingY: 292,
        firstRowY: 270,
        rowHeight: 15,
        fontSize: 12,
      },
    );
    drawCentered(
      cover,
      `Printed at ${options.printerName}`,
      helveticaRegular,
      16,
      tableBottom - 30,
      GRAY,
    );
  } else {
    drawCentered(
      cover,
      `Printed at ${options.printerName}`,
      helveticaRegular,
      16,
      310,
      GRAY,
    );
  }
  drawCentered(
    cover,
    'Hand to the owner only. Do not leave unattended.',
    helveticaBold,
    14,
    MARGIN + 10,
    BLACK,
  );

  const pages = await dstPdf.copyPages(
    srcPdf,
    srcPdf.getPageIndices(),
  );
  for (const page of pages) {
    dstPdf.addPage(page);
  }
  return dstPdf.save();
}
