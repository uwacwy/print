import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { firstValueFrom, take, toArray } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAgentJobs } from '@uwacwy/print-shared';
import {
  chooseDocumentFormat,
  convertPdfToPclm,
  getSupportedDocumentFormats,
  printDocument,
} from '../ipp-printer/ipp-printer.js';
import {
  createPrinter,
  CupsPrinter,
  IppPrinter,
  type PrinterConstructor,
} from './printer.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('../ipp-printer/ipp-printer.js', () => ({
  validateIppPrinterUri: (value: string) => new URL(value),
  chooseDocumentFormat: vi.fn(),
  convertPdfToPclm: vi.fn(),
  getSupportedDocumentFormats: vi.fn(),
  printDocument: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

/** Fakes `lp`, exiting with each code in turn (0 when exhausted). */
function fakeLp(
  codes: number[] = [],
  onArgs: (args: readonly string[]) => void = () => {},
) {
  vi.mocked(spawn).mockImplementation((_command, args) => {
    onArgs(args as readonly string[]);
    const child = new EventEmitter() as ReturnType<typeof spawn>;
    Object.assign(child, {
      stderr: Object.assign(new EventEmitter(), {
        setEncoding: vi.fn(),
      }),
      kill: vi.fn(),
    });
    const code = codes.shift() ?? 0;
    queueMicrotask(() => child.emit('close', code, null));
    return child;
  });
}

const job = (id: string) => ({ id, title: `Job ${id}` });

describe('printer drivers', () => {
  it('accepts assembled jobs without a printer-level copy count', () => {
    expect(parseAgentJobs([{ id: 'job-1', title: 'W-2' }])).toEqual([
      { id: 'job-1', title: 'W-2' },
    ]);
  });

  it('constructs every driver from the same connection string', () => {
    const drivers: PrinterConstructor[] = [CupsPrinter, IppPrinter];
    const conns = ['cups://Queue', 'ipp://printer.local/ipp/print'];
    drivers.forEach((Driver, index) =>
      expect(new Driver(conns[index]!).options.maxBytes).toBe(
        100 * 1024 * 1024,
      ),
    );
  });

  it('routes cups:// to CUPS without querying IPP and preserves the queue name', async () => {
    const printer = createPrinter(
      'cups://HP_LaserJet_MFP_M130fw_D8F5EC',
    );
    expect(printer).toBeInstanceOf(CupsPrinter);
    await printer.ready();
    expect(getSupportedDocumentFormats).not.toHaveBeenCalled();
    const pdf = Buffer.from('%PDF-test');
    fakeLp([], (args) =>
      expect(readFileSync(args[args.length - 1]!)).toEqual(pdf),
    );
    await printer.print(pdf, { title: 'W-2' });
    expect(spawn).toHaveBeenCalledWith(
      'lp',
      [
        '-d',
        'HP_LaserJet_MFP_M130fw_D8F5EC',
        '-t',
        'W-2',
        expect.any(String),
      ],
      expect.any(Object),
    );
  });

  it('reads CUPS settings and passes option_* through to lp in order', async () => {
    const printer = createPrinter(
      'cups://Queue?option_print-quality=3&maxBytes=2048&mimeTypes=application/pdf,image/png&timeout=5000&option_sides=two-sided-long-edge&option_fit-to-page=',
    );
    expect(printer.options).toEqual({
      maxBytes: 2048,
      mimeTypes: ['application/pdf', 'image/png'],
      timeoutMs: 5000,
    });
    fakeLp();
    await printer.print(Buffer.from('%PDF-test'), { title: 'W-2' });
    expect(spawn).toHaveBeenCalledWith(
      'lp',
      [
        '-d',
        'Queue',
        '-t',
        'W-2',
        '-o',
        'print-quality=3',
        '-o',
        'sides=two-sided-long-edge',
        '-o',
        'fit-to-page',
        expect.any(String),
      ],
      expect.any(Object),
    );
  });

  it.each([
    ['cups://queue/other', /cups:\/\//],
    ['cups://queue:631', /cups:\/\//],
    ['cups://queue?format=application/pdf', /format.*not supported/],
    ['cups://queue?quality=draft', /quality.*not supported/],
    ['cups://queue?option_=3', /invalid name/],
    ['cups://queue?option_-o=3', /invalid name/],
    ['cups://queue?option_media=A4%20Letter', /spaces/],
    ['cups://queue?option_sides=a&option_sides=b', /repeated/],
  ])('rejects %s', (conn, message) => {
    expect(() => createPrinter(conn)).toThrow(message);
  });

  it('routes network URIs to IPP and negotiates the format once', async () => {
    vi.mocked(getSupportedDocumentFormats).mockResolvedValue([
      'application/PCLm',
    ]);
    vi.mocked(chooseDocumentFormat).mockReturnValue(
      'application/PCLm',
    );
    vi.mocked(convertPdfToPclm).mockResolvedValue(
      Buffer.from('pclm'),
    );
    const printer = createPrinter(
      'ipp://printer.local:631/ipp/print?maxBytes=4096&quality=normal',
    );
    expect(printer).toBeInstanceOf(IppPrinter);
    await printer.ready();
    await printer.print(Buffer.from('%PDF-test'), { title: 'Tax' });
    expect(getSupportedDocumentFormats).toHaveBeenCalledTimes(1);
    expect(getSupportedDocumentFormats).toHaveBeenCalledWith(
      new URL('ipp://printer.local:631/ipp/print'),
    );
    expect(convertPdfToPclm).toHaveBeenCalledWith(
      Buffer.from('%PDF-test'),
      4096,
    );
    expect(printDocument).toHaveBeenCalledWith(
      expect.any(URL),
      Buffer.from('pclm'),
      { title: 'Tax' },
      'application/PCLm',
      { quality: 'normal', timeoutMs: 120_000 },
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('skips negotiation when the format is forced and retries failed negotiation', async () => {
    const forced = createPrinter(
      'ipps://printer.local/ipp/print?format=application/pdf',
    );
    await forced.ready();
    expect(getSupportedDocumentFormats).not.toHaveBeenCalled();

    vi.mocked(getSupportedDocumentFormats)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(['application/pdf']);
    vi.mocked(chooseDocumentFormat).mockReturnValue(
      'application/pdf',
    );
    const negotiated = createPrinter(
      'ipp://printer.local/ipp/print',
    );
    await expect(negotiated.ready()).rejects.toThrow('offline');
    await expect(negotiated.ready()).resolves.toBeUndefined();
  });
});

describe('print queue', () => {
  it('prints enqueued jobs one at a time and reports each result in order', async () => {
    fakeLp([0, 1, 0]);
    const printer = createPrinter('cups://Queue');
    const results = firstValueFrom(
      printer.results$.pipe(take(3), toArray()),
    );
    ['a', 'b', 'c'].forEach((id) =>
      printer.enqueue(job(id), Buffer.from('%PDF-test')),
    );

    expect(await results).toEqual([
      { job: job('a'), status: 'printed' },
      {
        job: job('b'),
        status: 'failed',
        error: expect.stringContaining('lp exited 1'),
      },
      { job: job('c'), status: 'printed' },
    ]);
    expect(spawn).toHaveBeenCalledTimes(3);
  });

  it('finishes the current job but drops queued ones on destroy', async () => {
    fakeLp();
    const printer = createPrinter('cups://Queue');
    const results = firstValueFrom(printer.results$.pipe(toArray()));
    printer.enqueue(job('a'), Buffer.from('%PDF-test'));
    printer.enqueue(job('b'), Buffer.from('%PDF-test'));
    printer.destroy();

    expect(await results).toEqual([
      { job: job('a'), status: 'printed' },
    ]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
