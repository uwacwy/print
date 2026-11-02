import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { firstValueFrom, NEVER, Subject, toArray } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simplifyPdf } from '../../helpers/pdf';
import type { PrintRequest } from '../../types';
import { CupsPrinter } from './cups-printer';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('../../helpers/pdf', () => ({ simplifyPdf: vi.fn() }));
vi.mock('../../helpers/logging', () => ({ log: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(simplifyPdf).mockImplementation((pdf) =>
    Promise.resolve(
      Buffer.concat([pdf, Buffer.from('-simplified')]),
    ),
  );
});

/**
 * Fakes the CUPS client: an enabled, idle queue that completes every job. `lp` exits with each
 * code in turn (0 when exhausted); `onLp` sees its arguments.
 */
function fakeLp(
  codes: number[] = [],
  onLp: (args: readonly string[]) => void = () => {},
) {
  let next = 0;
  vi.mocked(spawn).mockImplementation((command, args) => {
    const argv = args as readonly string[];
    let code = 0;
    let stdout = '';
    if (command === 'lp') {
      onLp(argv);
      code = codes.shift() ?? 0;
      stdout = `request id is Queue-${++next} (1 file(s))\n`;
    } else if (command === 'lpstat' && argv[0] === '-p') {
      stdout = `printer ${argv[1]} is idle.  enabled since today\n`;
    } else if (argv.includes('completed')) {
      stdout = Array.from(
        { length: next },
        (_, index) =>
          `Queue-${index + 1} print 1024 today\n\tStatus: \n\tAlerts: job-completed-successfully\n`,
      ).join('');
    }
    const stream = () =>
      Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    const child = new EventEmitter() as ReturnType<typeof spawn>;
    const out = stream();
    Object.assign(child, {
      stdout: out,
      stderr: stream(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      out.emit('data', stdout);
      child.emit('close', code, null);
    });
    return child;
  });
}

const lpCalls = () =>
  vi
    .mocked(spawn)
    .mock.calls.filter(([command]) => command === 'lp');

const cups = (conn: string) => new CupsPrinter(conn, NEVER);

describe('CupsPrinter', () => {
  it('simplifies the PDF and prints with only -d and -t by default', async () => {
    const printer = cups('cups://HP_LaserJet_MFP_M130fw_D8F5EC');
    expect(printer.options.maxBytes).toBe(100 * 1024 * 1024);
    await printer.ready();
    const pdf = Buffer.from('%PDF-test');
    fakeLp([], (args) =>
      expect(readFileSync(args[args.length - 1]!).toString()).toBe(
        '%PDF-test-simplified',
      ),
    );
    await printer.print(pdf, { title: 'W-2' });
    expect(simplifyPdf).toHaveBeenCalledWith(pdf, {
      dpi: 150,
      maximumBytes: 100 * 1024 * 1024,
    });
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
    const printer = cups(
      'cups://Queue?option_print-quality=3&maxBytes=2048&mimeTypes=application/pdf,image/png&timeout=5000&dpi=0&option_sides=two-sided-long-edge&option_fit-to-page=',
    );
    expect(printer.options).toEqual({
      maxBytes: 2048,
      mimeTypes: ['application/pdf', 'image/png'],
      timeoutMs: 5000,
      dpi: 0,
    });
    fakeLp();
    await printer.print(Buffer.from('%PDF-test'), { title: 'W-2' });
    expect(simplifyPdf).not.toHaveBeenCalled();
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
    ['cups://queue?dpi=10', /dpi must be an integer of at least 72/],
    ['cups://queue?option_=3', /invalid name/],
    ['cups://queue?option_media=A4%20Letter', /spaces/],
  ])('rejects %s', (conn, message) => {
    expect(() => cups(conn)).toThrow(message);
  });

  it('prints requests from jobs$ in order and reports each result', async () => {
    fakeLp([0, 1, 0]);
    const jobs$ = new Subject<PrintRequest>();
    const printer = new CupsPrinter('cups://Queue', jobs$);
    const results = firstValueFrom(printer.results$.pipe(toArray()));
    const job = (id: string) => ({ id, title: `Job ${id}` });
    ['a', 'b', 'c'].forEach((id) =>
      jobs$.next({ job: job(id), pdf: Buffer.from('%PDF-test') }),
    );
    // Let all three start before completing, which would drop any still waiting.
    await vi.waitFor(() => expect(lpCalls()).toHaveLength(3));
    jobs$.complete();

    expect(await results).toEqual([
      { job: job('a'), status: 'printed' },
      {
        job: job('b'),
        status: 'failed',
        error: expect.stringContaining('lp exited 1'),
      },
      { job: job('c'), status: 'printed' },
    ]);
  });
});
