import { PDFDocument, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import {
  BLACK,
  drawCentered,
  GRAY,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  winAnsi,
} from "../pdf-layout.js";

export interface QrPosterOptions {
  siteTitle: string;
  printerName: string;
  url: string;
  date: Date;
  timeZone?: string;
}

export async function buildQrPoster(options: QrPosterOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(`${options.printerName} - print QR code`));
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const dateText = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: options.timeZone,
  }).format(options.date);
  drawCentered(page, options.siteTitle, regular, 18, PAGE_HEIGHT - MARGIN - 18, GRAY);
  drawCentered(page, options.printerName, bold, 40, PAGE_HEIGHT - MARGIN - 70);
  drawCentered(page, dateText, regular, 16, PAGE_HEIGHT - MARGIN - 100, GRAY);

  const { modules } = QRCode.create(options.url, { errorCorrectionLevel: "M" });
  const quietZone = 4;
  const qrSize = 360;
  const cell = qrSize / (modules.size + quietZone * 2);
  const qrLeft = (PAGE_WIDTH - qrSize) / 2;
  const qrTop = PAGE_HEIGHT - MARGIN - 140;
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      page.drawRectangle({
        x: qrLeft + (col + quietZone) * cell,
        y: qrTop - (row + quietZone + 1) * cell,
        width: cell,
        height: cell,
        color: BLACK,
      });
    }
  }

  const textTop = qrTop - qrSize - 36;
  drawCentered(page, "Scan with your phone camera to print a document", bold, 18, textTop);
  drawCentered(page, "or visit", regular, 14, textTop - 30, GRAY);
  drawCentered(page, options.url, regular, 18, textTop - 56);
  return pdf.save();
}
