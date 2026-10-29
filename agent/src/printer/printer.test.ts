import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseServerMessage } from "@uwacwy/print-shared";
import { chooseDocumentFormat, convertPdfToPclm, getSupportedDocumentFormats, printDocument } from "../ipp-printer/ipp-printer.js";
import { createPrinter, CupsPrinter, IppPrinter } from "./printer.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../ipp-printer/ipp-printer.js", () => ({
  validateIppPrinterUri: (value: string) => new URL(value),
  chooseDocumentFormat: vi.fn(),
  convertPdfToPclm: vi.fn(),
  getSupportedDocumentFormats: vi.fn(),
  printDocument: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("printer drivers", () => {
  it("accepts assembled jobs without a printer-level copy count", () => {
    expect(parseServerMessage(JSON.stringify({ type: "jobs", jobs: [{ id: "job-1", title: "W-2" }] })))
      .toEqual({ type: "jobs", jobs: [{ id: "job-1", title: "W-2" }] });
  });

  it("routes cups:// to CUPS without querying IPP and preserves the queue name", async () => {
    const printer = await createPrinter("cups://HP_LaserJet_MFP_M130fw_D8F5EC", 1000);
    expect(printer).toBeInstanceOf(CupsPrinter);
    expect(getSupportedDocumentFormats).not.toHaveBeenCalled();
    const pdf = Buffer.from("%PDF-test");
    vi.mocked(spawn).mockImplementation((_command, args) => {
      expect(readFileSync(args![args!.length - 1] as string)).toEqual(pdf);
      const child = new EventEmitter() as ReturnType<typeof spawn>;
      Object.assign(child, { stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }), kill: vi.fn() });
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    });
    await printer.print(pdf, { title: "W-2" });
    expect(spawn).toHaveBeenCalledWith("lp", ["-d", "HP_LaserJet_MFP_M130fw_D8F5EC", "-t", "W-2", expect.any(String)], expect.any(Object));
  });

  it("rejects malformed CUPS destinations", async () => {
    await expect(createPrinter("cups://queue/other", 1000)).rejects.toThrow(/cups:\/\//);
    await expect(createPrinter("cups://queue:631", 1000)).rejects.toThrow(/cups:\/\//);
  });

  it("routes network URIs to IPP and negotiates the format", async () => {
    vi.mocked(getSupportedDocumentFormats).mockResolvedValue(["application/PCLm"]);
    vi.mocked(chooseDocumentFormat).mockReturnValue("application/PCLm");
    vi.mocked(convertPdfToPclm).mockResolvedValue(Buffer.from("pclm"));
    const printer = await createPrinter("ipp://printer.local:631/ipp/print", 1000);
    expect(printer).toBeInstanceOf(IppPrinter);
    await printer.print(Buffer.from("%PDF-test"), { title: "Tax" });
    expect(printDocument).toHaveBeenCalledWith(expect.any(URL), Buffer.from("pclm"), { title: "Tax" }, "application/PCLm");
    expect(spawn).not.toHaveBeenCalled();
  });
});
