import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildQrPoster } from "./qr-poster.js";

describe("QR poster", () => {
  it("renders a single letter-size page", async () => {
    const bytes = await buildQrPoster({
      siteTitle: "VITA Secure Print",
      printerName: "Main Office",
      url: "https://print.example.org/p/main",
      date: new Date("2026-10-26T18:00:00Z"),
      timeZone: "America/Denver",
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(document.getTitle()).toBe("Main Office - print QR code");
  });

  it("tolerates names outside the standard PDF font character set", async () => {
    await expect(
      buildQrPoster({
        siteTitle: "Print",
        printerName: "Biblioteca 📚 Łódź",
        url: "https://print.example.org/p/lib",
        date: new Date(),
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
