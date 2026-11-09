import {
  PDFDocument,
  PDFString,
  StandardFonts,
  type PDFPage,
} from 'pdf-lib';
import QRCode from 'qrcode';
import {
  BLACK,
  drawCentered,
  GRAY,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  winAnsi,
} from '../pdf-layout/pdf-layout';

export interface QrPosterOptions {
  siteTitle: string;
  printerName: string;
  /** Encoded in the QR code and linked from the page; may carry an upload token. */
  url: string;
  /** Short, typeable address printed under the code with the PIN; defaults to `url`. */
  displayUrl?: string;
  date: Date;
  timeZone?: string;
  validFrom?: Date;
  validUntil?: Date;
  /** Printer PIN (###-###-###) for visitors who type the address instead of scanning; without one, only the QR code is offered. */
  pin?: string | null;
}

/** Makes a rectangle of the page open `url` when clicked in a PDF viewer. */
function addLink(
  pdf: PDFDocument,
  page: PDFPage,
  url: string,
  [x, y, width, height]: [number, number, number, number],
): void {
  const annotation = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  );
  page.node.addAnnot(annotation);
}

export async function buildQrPoster(
  options: QrPosterOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(`${options.printerName} - print QR code`));
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  const dateText = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeZone: options.timeZone,
  }).format(options.date);
  drawCentered(
    page,
    options.siteTitle,
    regular,
    18,
    PAGE_HEIGHT - MARGIN - 18,
    GRAY,
  );
  drawCentered(
    page,
    options.printerName,
    bold,
    40,
    PAGE_HEIGHT - MARGIN - 70,
  );
  drawCentered(
    page,
    dateText,
    regular,
    16,
    PAGE_HEIGHT - MARGIN - 100,
    GRAY,
  );

  const { modules } = QRCode.create(options.url, {
    errorCorrectionLevel: 'M',
  });
  const quietZone = 4;
  const qrSize = 360;
  const cell = qrSize / (modules.size + quietZone * 2);
  const qrLeft = (PAGE_WIDTH - qrSize) / 2;
  const qrTop = PAGE_HEIGHT - MARGIN - 140;
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) {
        continue;
      }
      page.drawRectangle({
        x: qrLeft + (col + quietZone) * cell,
        y: qrTop - (row + quietZone + 1) * cell,
        width: cell,
        height: cell,
        color: BLACK,
      });
    }
  }

  addLink(pdf, page, options.url, [
    qrLeft,
    qrTop - qrSize,
    qrSize,
    qrSize,
  ]);

  const textTop = qrTop - qrSize - 36;
  drawCentered(
    page,
    'Scan with your phone camera to print a document',
    bold,
    18,
    textTop,
  );
  let nextLine = textTop - 30;
  // Without a PIN, the typeable address has no way to authorize an upload.
  if (options.pin) {
    drawCentered(page, 'or visit', regular, 14, nextLine, GRAY);
    const displaySize = drawCentered(
      page,
      options.displayUrl ?? options.url,
      regular,
      18,
      nextLine - 26,
    );
    addLink(pdf, page, options.url, [
      MARGIN,
      nextLine - 30,
      PAGE_WIDTH - MARGIN * 2,
      displaySize + 8,
    ]);
    drawCentered(page, 'and enter PIN', regular, 14, nextLine - 56, GRAY);
    drawCentered(page, options.pin, mono, 26, nextLine - 84);
    nextLine -= 112;
  }

  if (options.validFrom && options.validUntil) {
    const format = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: options.timeZone,
    });
    drawCentered(
      page,
      `This code works ${format.formatRange(options.validFrom, options.validUntil)}`,
      regular,
      12,
      nextLine,
      GRAY,
    );
  }
  return pdf.save();
}
