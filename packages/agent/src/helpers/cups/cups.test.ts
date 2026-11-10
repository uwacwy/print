import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CupsClient,
  humanQueueName,
  parseQueueDescriptions,
  parseQueueList,
  parseJobOutcome,
  parseQueueState,
  parseCupsQueue,
  parseRequestId,
  takeLpOptions,
} from './cups';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

type Reply = string | { code: number; stderr?: string };

/** Answers each CUPS command with `reply(command, args)`. */
function fakeCups(
  reply: (command: string, args: string[]) => Reply,
) {
  vi.mocked(spawn).mockImplementation((command, args) => {
    const result = reply(command, [...(args)]);
    const { code, stdout, stderr } =
      typeof result === 'string'
        ? { code: 0, stdout: result, stderr: '' }
        : { stdout: '', stderr: '', ...result };
    const stream = () =>
      Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    const child = new EventEmitter() as ReturnType<typeof spawn>;
    const out = stream();
    const err = stream();
    Object.assign(child, {
      stdout: out,
      stderr: err,
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      out.emit('data', stdout);
      err.emit('data', stderr);
      child.emit('close', code, null);
    });
    return child;
  });
}

const commands = () =>
  vi
    .mocked(spawn)
    .mock.calls.map(([command, args]) =>
      [command, ...(args as string[])].join(' '),
    );

const ENABLED = 'printer Queue is idle.  enabled since today\n';
const DISABLED =
  'printer Queue disabled since today -\n\tUnable to add document to print job.\n';
const COMPLETED = [
  'Queue-7 print 6144 today',
  '\tStatus: ',
  '\tAlerts: job-completed-successfully',
  '\tqueued for Queue',
  'Queue-8 print 280576 today',
  '\tStatus: Unable to add document to print job.',
  '\tAlerts: canceled-at-device',
  '\tqueued for Queue',
  '',
].join('\n');

describe('takeLpOptions', () => {
  it('moves option_* parameters into lp options, in order', () => {
    const { conn, lpOptions } = takeLpOptions(
      'cups://Queue?option_sides=two-sided-long-edge&dpi=150&option_fit-to-page=',
    );
    expect(lpOptions).toEqual([
      'sides=two-sided-long-edge',
      'fit-to-page',
    ]);
    expect(conn.href).toBe('cups://Queue?dpi=150');
  });

  it.each([
    ['cups://queue?option_=3', /invalid name/],
    ['cups://queue?option_-o=3', /invalid name/],
    ['cups://queue?option_media=A4%20Letter', /spaces/],
    ['cups://queue?option_sides=a&option_sides=b', /repeated/],
    ['not a url', /valid URL/],
  ])('rejects %s', (conn, message) => {
    expect(() => takeLpOptions(conn)).toThrow(message);
  });
});

describe('parseCupsQueue', () => {
  it('returns the queue name', () => {
    expect(
      parseCupsQueue(new URL('cups://HP_LaserJet-M130.fw')),
    ).toBe('HP_LaserJet-M130.fw');
  });

  it.each([
    'cups://queue/other',
    'cups://queue:631',
    'cups://user@queue',
    'cups://queue#x',
    'ipp://queue',
  ])('rejects %s', (uri) => {
    expect(() => parseCupsQueue(new URL(uri))).toThrow(
      'CUPS destination must be cups://<queue_name>',
    );
  });

  it('rejects unsupported characters', () => {
    expect(() =>
      parseCupsQueue(new URL('cups://queue%20x')),
    ).toThrow('unsupported characters');
  });
});

describe('lpstat parsing', () => {
  it('reads queue state and the stop reason', () => {
    expect(parseQueueState(ENABLED)).toEqual({
      enabled: true,
      reason: '',
    });
    expect(parseQueueState(DISABLED)).toEqual({
      enabled: false,
      reason: 'Unable to add document to print job.',
    });
  });

  it('reads one job outcome from lpstat -l', () => {
    expect(parseJobOutcome(COMPLETED, 'Queue-7')).toEqual({
      alerts: ['job-completed-successfully'],
      status: '',
    });
    expect(parseJobOutcome(COMPLETED, 'Queue-8')).toEqual({
      alerts: ['canceled-at-device'],
      status: 'Unable to add document to print job.',
    });
    expect(parseJobOutcome(COMPLETED, 'Queue-80')).toBeUndefined();
  });

  it('reads the lp request id', () => {
    expect(
      parseRequestId('request id is HP-LaserJet-14 (1 file(s))\n'),
    ).toBe('HP-LaserJet-14');
    expect(parseRequestId('')).toBeUndefined();
  });
});

describe('CupsClient', () => {
  const cups = new CupsClient('Queue', 5000);
  const wait = { waitMs: 60_000, pollMs: 0 };

  it('runs CUPS commands untranslated with sbin on PATH', async () => {
    fakeCups(() => ENABLED);
    await cups.queueState();
    const env = vi.mocked(spawn).mock.calls[0]![2].env!;
    expect(env['LC_ALL']).toBe('C');
    expect(env['PATH']).toMatch(/:\/usr\/sbin:\/sbin$/);
  });

  it('re-enables a stopped queue, and explains when it cannot', async () => {
    fakeCups((command) => (command === 'lpstat' ? DISABLED : ''));
    await cups.ensureEnabled();
    expect(commands()).toEqual([
      'lpstat -p Queue',
      'cupsenable Queue',
    ]);

    fakeCups((command) =>
      command === 'lpstat'
        ? DISABLED
        : { code: 1, stderr: 'Forbidden' },
    );
    await expect(cups.ensureEnabled()).rejects.toThrow(
      'CUPS queue Queue is stopped (Unable to add document to print job.) and could not be re-enabled: cupsenable exited 1: Forbidden',
    );
  });

  it('submits with lp and returns the job id', async () => {
    fakeCups(() => 'request id is Queue-7 (1 file(s))\n');
    await expect(
      cups.submit('/tmp/doc.pdf', 'W-2', ['sides=one-sided']),
    ).resolves.toBe('Queue-7');
    expect(commands()).toEqual([
      'lp -d Queue -t W-2 -o sides=one-sided /tmp/doc.pdf',
    ]);
  });

  it('waits until CUPS completes the job', async () => {
    let polls = 0;
    fakeCups((_, args) => {
      if (args.includes('not-completed')) {
        return ++polls < 3 ? 'Queue-7 print 6144 today\n' : '';
      }
      return args[0] === '-p' ? ENABLED : COMPLETED;
    });
    await cups.waitForJob('Queue-7', wait);
    expect(polls).toBe(3);
  });

  it('fails a job CUPS did not complete successfully', async () => {
    fakeCups((_, args) =>
      args.includes('not-completed') ? '' : COMPLETED,
    );
    await expect(cups.waitForJob('Queue-8', wait)).rejects.toThrow(
      'CUPS job Queue-8 did not complete (canceled-at-device): Unable to add document to print job.',
    );
  });

  const PENDING_9 =
    'Queue-9 print 280576 today\n\tStatus: Unable to add document to print job.\n\tAlerts: job-printing\n';

  it('re-enables a stopped queue so CUPS retries the job', async () => {
    let stopped = true;
    let polls = 0;
    const log = vi.fn();
    fakeCups((command, args) => {
      if (command === 'cupsenable') {
        stopped = false;
        return '';
      }
      if (args.includes('not-completed')) {
        return ++polls < 3 ? PENDING_9 : '';
      }
      if (args[0] === '-p') {
        return stopped ? DISABLED : ENABLED;
      }
      return 'Queue-9 print 280576 today\n\tStatus: \n\tAlerts: job-completed-successfully\n';
    });
    await cups.waitForJob('Queue-9', {
      ...wait,
      retryDelaysMs: [0, 0, 0],
      log,
    });
    expect(commands()).toContain('cupsenable Queue');
    expect(commands()).not.toContain('cancel Queue-9');
    expect(log).toHaveBeenCalledWith(
      'CUPS stopped Queue (Unable to add document to print job.); retrying job Queue-9 in 1 second (attempt 1 of 3).',
    );
  });

  it('cancels the job after the retries are spent', async () => {
    const log = vi.fn();
    fakeCups((command, args) => {
      if (args.includes('not-completed')) {
        return PENDING_9;
      }
      return command === 'lpstat' ? DISABLED : '';
    });
    await expect(
      cups.waitForJob('Queue-9', {
        ...wait,
        retryDelaysMs: [0, 0, 0],
        log,
      }),
    ).rejects.toThrow(
      'CUPS stopped Queue after 3 retries: Unable to add document to print job.',
    );
    expect(log).toHaveBeenCalledTimes(3);
    expect(
      commands().filter((each) => each === 'cupsenable Queue'),
    ).toHaveLength(4);
    expect(commands().slice(-2)).toEqual([
      'cancel Queue-9',
      'cupsenable Queue',
    ]);
  });

  it("falls back to the queue's reason when the job has no status", async () => {
    fakeCups((command, args) => {
      if (args.includes('not-completed')) {
        return 'Queue-9 print 280576 today\n';
      }
      return command === 'lpstat'
        ? 'printer Queue disabled since today -\n\tRendering completed\n'
        : '';
    });
    await expect(
      cups.waitForJob('Queue-9', { ...wait, retryDelaysMs: [] }),
    ).rejects.toThrow(
      'CUPS stopped Queue after 0 retries: Rendering completed',
    );
  });

  it('gives up instead of retrying past the wait deadline', async () => {
    fakeCups((command, args) => {
      if (args.includes('not-completed')) {
        return PENDING_9;
      }
      return command === 'lpstat' ? DISABLED : '';
    });
    await expect(
      cups.waitForJob('Queue-9', {
        waitMs: 1000,
        pollMs: 0,
        retryDelaysMs: [15_000],
      }),
    ).rejects.toThrow('after 0 retries');
    expect(commands()).toContain('cancel Queue-9');
  });

  it('cancels a job still pending after the wait', async () => {
    fakeCups((_, args) =>
      args.includes('not-completed')
        ? 'Queue-9 print 280576 today\n'
        : args[0] === '-p'
          ? ENABLED
          : '',
    );
    await expect(
      cups.waitForJob('Queue-9', { waitMs: 0, pollMs: 0 }),
    ).rejects.toThrow(
      'CUPS job Queue-9 did not finish within 0 seconds and was canceled.',
    );
    expect(commands()).toContain('cancel Queue-9');
  });
});

describe('queue discovery parsing', () => {
  it('lists destinations from lpstat -e', () => {
    expect(
      parseQueueList(
        'fake_null_printer\nHP-LaserJet-MFP-M129-M134\nHP_LaserJet_MFP_M130fw_D8F5EC\n\nlpstat: odd line\n',
      ),
    ).toEqual([
      'fake_null_printer',
      'HP-LaserJet-MFP-M129-M134',
      'HP_LaserJet_MFP_M130fw_D8F5EC',
    ]);
  });

  it('reads descriptions from lpstat -l -p', () => {
    const output = [
      'printer fake_null_printer is idle.  enabled since Wed 04 Nov 2026 07:15:14 PM MST',
      '\tForm mounted:',
      '\tDescription: fake_null_printer',
      '\tLocation: ',
      'printer HP-LaserJet-MFP-M129-M134 disabled since Wed 04 Nov 2026 -',
      '\treason unknown',
      '\tDescription: HP LaserJet MFP M130fw (D8F5EC)',
      '\tAlerts: wifi-not-configured-report',
      'printer Blank is idle.  enabled since Wed 04 Nov 2026',
      '\tDescription: ',
    ].join('\n');
    expect(parseQueueDescriptions(output)).toEqual(
      new Map([
        ['fake_null_printer', 'fake_null_printer'],
        [
          'HP-LaserJet-MFP-M129-M134',
          'HP LaserJet MFP M130fw (D8F5EC)',
        ],
      ]),
    );
  });

  it('prefers a real description for the human name', () => {
    expect(humanQueueName('Q', 'Front Desk')).toBe('Front Desk');
    expect(
      humanQueueName('fake_null_printer', 'fake_null_printer'),
    ).toBe('fake null printer');
    expect(humanQueueName('HP_LaserJet_M130')).toBe(
      'HP LaserJet M130',
    );
  });
});
