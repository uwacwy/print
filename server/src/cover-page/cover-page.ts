import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  BLACK,
  drawCentered,
  drawTwoColumnTable,
  GRAY,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  winAnsi,
} from "../pdf-layout.js";

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
  const document = await PDFDocument.load(source, { updateMetadata: false });
  const pageCount = document.getPageCount();
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(options.title));
  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const submitted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: options.timeZone,
  }).format(options.submittedAt);
  const inflect = (count: number, singular: string, plural = `${singular}s`) =>
    `${count} ${count === 1 ? singular : plural}`;

  drawCentered(
    cover,
    options.siteTitle,
    regular,
    18,
    PAGE_HEIGHT - MARGIN - 18,
    GRAY,
  );
  drawCentered(cover, "CONFIDENTIAL", bold, 54, 560);
  drawCentered(cover, "Contains personal information", regular, 22, 522);
  cover.drawLine({
    start: { x: MARGIN, y: 480 },
    end: { x: PAGE_WIDTH - MARGIN, y: 480 },
    thickness: 1,
    color: GRAY,
  });
  drawCentered(cover, "DOCUMENT", regular, 12, 440, GRAY);
  drawCentered(cover, options.title, bold, 30, 405);
  drawCentered(cover, `Submitted ${submitted}`, regular, 16, 360, GRAY);
  drawCentered(cover, inflect(pageCount, "page"), regular, 16, 335, GRAY);

  if (options.documents.length) {
    const tableBottom = drawTwoColumnTable(
      cover,
      ["Document", "Copies"],
      options.documents.map((item) => [item.titleOrFilename, inflect(item.copies, "copy", "copies")]),
      { regular, bold },
      { width: 400, headingY: 292, firstRowY: 270, rowHeight: 15, fontSize: 12 },
    );
    drawCentered(
      cover,
      `Printed at ${options.printerName}`,
      regular,
      16,
      tableBottom - 30,
      GRAY,
    );
  } else {
    drawCentered(cover, `Printed at ${options.printerName}`, regular, 16, 310, GRAY);
  }
  drawCentered(
    cover,
    "Hand to the owner only. Do not leave unattended.",
    bold,
    14,
    MARGIN + 10,
    BLACK,
  );

  const pages = await pdf.copyPages(document, document.getPageIndices());
  for (const page of pages) pdf.addPage(page);
  return pdf.save();
}
