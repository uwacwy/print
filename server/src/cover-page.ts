import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  BLACK,
  drawCentered,
  GRAY,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  winAnsi,
} from '../../packages/server/src/lib/pdf-layout.js';

export interface CoverPageOptions {
  siteTitle: string;
  printerName: string;
  title: string;
  submittedAt: Date;
  timeZone?: string;
  documents: { titleOrFilename: string; copies: number }[];
}

/** Returns the document with a confidential cover sheet as its first page. */
export async function addCoverPage(
  source: Uint8Array,
  options: CoverPageOptions,
): Promise<Uint8Array> {
  const document = await PDFDocument.load(source, {
    updateMetadata: false,
  });
  const pageCount = document.getPageCount();
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(options.title));
  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const submitted = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: options.timeZone,
  }).format(options.submittedAt);
  const inflect = (
    count: number,
    singular: string,
    plural = `${singular}s`,
  ) => `${count} ${count === 1 ? singular : plural}`;

  drawCentered(
    cover,
    options.siteTitle,
    regular,
    18,
    PAGE_HEIGHT - MARGIN - 18,
    GRAY,
  );
  drawCentered(cover, 'CONFIDENTIAL', bold, 54, 560);
  drawCentered(
    cover,
    'Contains personal information',
    regular,
    22,
    522,
  );
  cover.drawLine({
    start: { x: MARGIN, y: 480 },
    end: { x: PAGE_WIDTH - MARGIN, y: 480 },
    thickness: 1,
    color: GRAY,
  });
  drawCentered(cover, 'DOCUMENT', regular, 12, 440, GRAY);
  drawCentered(cover, options.title, bold, 30, 405);
  drawCentered(
    cover,
    `Submitted ${submitted}`,
    regular,
    16,
    360,
    GRAY,
  );
  drawCentered(
    cover,
    inflect(pageCount, 'page'),
    regular,
    16,
    335,
    GRAY,
  );

  if (options.documents.length) {
    const tableWidth = 400;
    const left = (PAGE_WIDTH - tableWidth) / 2;
    const right = left + tableWidth;
    const fontSize = 12;
    const rowHeight = 15;
    const firstRowY = 270;
    cover.drawText('Document', {
      x: left,
      y: 292,
      size: fontSize,
      font: bold,
    });
    const copiesHeading = 'Copies';
    cover.drawText(copiesHeading, {
      x: right - bold.widthOfTextAtSize(copiesHeading, fontSize),
      y: 292,
      size: fontSize,
      font: bold,
    });
    cover.drawLine({
      start: { x: left, y: 285 },
      end: { x: right, y: 285 },
      thickness: 0.5,
      color: GRAY,
    });
    options.documents.forEach((item, index) => {
      const y = firstRowY - index * rowHeight;
      const copies = inflect(item.copies, 'copy', 'copies');
      const copiesWidth = regular.widthOfTextAtSize(
        copies,
        fontSize,
      );
      const availableWidth = tableWidth - copiesWidth - 18;
      let filename = winAnsi(item.titleOrFilename);
      if (
        regular.widthOfTextAtSize(filename, fontSize) >
        availableWidth
      ) {
        while (
          filename.length &&
          regular.widthOfTextAtSize(`${filename}...`, fontSize) >
            availableWidth
        ) {
          filename = filename.slice(0, -1);
        }
        filename += '...';
      }
      cover.drawText(filename, {
        x: left,
        y,
        size: fontSize,
        font: regular,
      });
      cover.drawText(copies, {
        x: right - copiesWidth,
        y,
        size: fontSize,
        font: regular,
      });
    });
    drawCentered(
      cover,
      `Printed at ${options.printerName}`,
      regular,
      16,
      firstRowY - options.documents.length * rowHeight - 30,
      GRAY,
    );
  } else {
    drawCentered(
      cover,
      `Printed at ${options.printerName}`,
      regular,
      16,
      310,
      GRAY,
    );
  }
  drawCentered(
    cover,
    'Hand to the owner only. Do not leave unattended.',
    bold,
    14,
    MARGIN + 10,
    BLACK,
  );

  const pages = await pdf.copyPages(
    document,
    document.getPageIndices(),
  );
  for (const page of pages) {
    pdf.addPage(page);
  }
  return pdf.save();
}
