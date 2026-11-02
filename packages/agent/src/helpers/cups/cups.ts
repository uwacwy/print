import { spawn } from 'node:child_process';
import type { CupsJobOutcome, CupsQueueState } from '../../types';

/** How long a CUPS job may stay queued or printing before the agent cancels it. */
export const CUPS_JOB_WAIT_MS = 10 * 60_000;
export const CUPS_POLL_MS = 2_000;
export const DEFAULT_CUPS_DPI = 150;

const LP_OPTION_PREFIX = 'option_';
const LP_OPTION_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const LP_OPTION_VALUE = /^[^\s\0-\x1f\x7f]{0,256}$/;
const CUPS_QUEUE = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Pulls `option_<name>=<value>` pairs out of a CUPS connection string so they can be
 * passed to `lp` verbatim as `-o <name>=<value>` (or `-o <name>` when the value is empty).
 */
export function takeLpOptions(conn: string | URL): {
  conn: URL;
  lpOptions: string[];
} {
  let uri: URL;
  try {
    uri = new URL(conn);
  } catch {
    throw new Error('PRINTER_URI must be a valid URL.');
  }
  const lpOptions: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of [...uri.searchParams]) {
    if (!key.startsWith(LP_OPTION_PREFIX)) {
      continue;
    }
    const name = key.slice(LP_OPTION_PREFIX.length);
    if (!LP_OPTION_NAME.test(name)) {
      throw new Error(
        `PRINTER_URI lp option "${key}" has an invalid name.`,
      );
    }
    if (!LP_OPTION_VALUE.test(value)) {
      throw new Error(
        `PRINTER_URI lp option "${key}" must not contain spaces or control characters.`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`PRINTER_URI option "${key}" is repeated.`);
    }
    seen.add(name);
    lpOptions.push(value ? `${name}=${value}` : name);
    uri.searchParams.delete(key);
  }
  return { conn: uri, lpOptions };
}

/** The queue name from a bare `cups://<queue_name>` URI (options already removed). */
export function parseCupsQueue(uri: URL): string {
  if (
    uri.protocol !== 'cups:' ||
    uri.username ||
    uri.password ||
    uri.port ||
    uri.hash ||
    uri.pathname ||
    !uri.hostname
  ) {
    throw new Error(
      `CUPS destination must be cups://<queue_name>. Was ${uri.href}`,
    );
  }
  if (!CUPS_QUEUE.test(uri.hostname)) {
    throw new Error('CUPS queue contains unsupported characters.');
  }
  return uri.hostname;
}

/** Untranslated CUPS output, and `cupsenable` from sbin even when PATH omits it. */
const CUPS_ENV = {
  ...process.env,
  LANG: 'C',
  LC_ALL: 'C',
  PATH: [process.env['PATH'], '/usr/sbin', '/sbin']
    .filter(Boolean)
    .join(':'),
};

/** Runs a CUPS client command and resolves with its stdout. */
export function runCups(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: CUPS_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-1000);
    });
    const timeout = setTimeout(
      () => child.kill('SIGKILL'),
      timeoutMs,
    );
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(
            `${command} exited ${code ?? signal}: ${stderr.trim() || 'CUPS rejected the request'}`,
          ),
        );
      }
    });
  });
}

/** Parses `lpstat -p <queue>`: `printer Q disabled since …\n\t<reason>` or `printer Q is idle.  enabled since …`. */
export function parseQueueState(output: string): CupsQueueState {
  const [first = '', ...rest] = output.split('\n');
  return {
    enabled: !/\bdisabled\b/.test(first),
    reason: rest
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' '),
  };
}

/** Finds one job's block in `lpstat -l -o` output. */
export function parseJobOutcome(
  output: string,
  jobId: string,
): CupsJobOutcome | undefined {
  const lines = output.split('\n');
  const start = lines.findIndex((line) =>
    line.startsWith(`${jobId} `),
  );
  if (start < 0) {
    return undefined;
  }
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) {
      break;
    }
    block.push(line.trim());
  }
  const field = (name: string) =>
    block
      .find((line) => line.startsWith(`${name}:`))
      ?.slice(name.length + 1)
      .trim() ?? '';
  return {
    alerts: field('Alerts')
      .split(/[\s,]+/)
      .filter(Boolean),
    status: field('Status'),
  };
}

/** `lp` prints `request id is Queue-42 (1 file(s))`. */
export function parseRequestId(output: string): string | undefined {
  return /request id is (\S+)/.exec(output)?.[1];
}

export class CupsClient {
  constructor(
    readonly queue: string,
    readonly timeoutMs: number,
  ) {}

  queueState(): Promise<CupsQueueState> {
    return runCups(
      'lpstat',
      ['-p', this.queue],
      this.timeoutMs,
    ).then(parseQueueState);
  }

  enable(): Promise<void> {
    return runCups('cupsenable', [this.queue], this.timeoutMs).then(
      () => undefined,
    );
  }

  /** Re-enables the queue if CUPS stopped it after an earlier printer error. */
  async ensureEnabled(): Promise<void> {
    const state = await this.queueState();
    if (state.enabled) {
      return;
    }
    await this.enable().catch((error: unknown) => {
      throw new Error(
        `CUPS queue ${this.queue} is stopped (${state.reason || 'no reason given'}) and could not be re-enabled: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Submits a file with `lp` and resolves with the CUPS job id.
   *
   *     lp options (set as option_<name>=<value> on PRINTER_URI)
   *     -o job-sheets=standard  Print a banner page with the job
   *     -o media=size           Specify the media size to use
   *     -o number-up=N          Print N input pages per sheet (1, 2, 4, 6, 9, 16)
   *     -o orientation-requested=N
   *                             Portrait (3) or landscape (4)
   *     -o print-quality=N      Draft (3), normal (4), or best (5)
   *     -o sides=one-sided | two-sided-long-edge | two-sided-short-edge
   */
  submit(
    file: string,
    title: string,
    lpOptions: readonly string[],
  ): Promise<string> {
    return runCups(
      'lp',
      [
        '-d',
        this.queue,
        '-t',
        title,
        ...lpOptions.flatMap((option) => ['-o', option]),
        file,
      ],
      this.timeoutMs,
    ).then((stdout) => {
      const id = parseRequestId(stdout);
      if (!id) {
        throw new Error(
          `lp did not report a job id: ${stdout.trim() || '(no output)'}`,
        );
      }
      return id;
    });
  }

  isPending(jobId: string): Promise<boolean> {
    return runCups(
      'lpstat',
      ['-W', 'not-completed', '-o', this.queue],
      this.timeoutMs,
    ).then((stdout) =>
      stdout
        .split('\n')
        .some((line) => line.startsWith(`${jobId} `)),
    );
  }

  outcome(jobId: string): Promise<CupsJobOutcome | undefined> {
    return runCups(
      'lpstat',
      ['-W', 'completed', '-l', '-o', this.queue],
      this.timeoutMs,
    ).then((stdout) => parseJobOutcome(stdout, jobId));
  }

  cancel(jobId: string): Promise<void> {
    return runCups('cancel', [jobId], this.timeoutMs).then(
      () => undefined,
    );
  }

  /**
   * Resolves once CUPS finishes `jobId` successfully. Rejects (cancelling the job so it can't
   * print later as a duplicate) when CUPS stops the queue, the job ends any other way, or it
   * is still pending after `waitMs`.
   */
  async waitForJob(
    jobId: string,
    { waitMs, pollMs }: { waitMs: number; pollMs: number },
  ): Promise<void> {
    const deadline = Date.now() + waitMs;
    while (await this.isPending(jobId)) {
      const state = await this.queueState();
      if (!state.enabled) {
        await this.cancel(jobId).catch(() => undefined);
        await this.enable().catch(() => undefined);
        throw new Error(
          `CUPS stopped ${this.queue} while printing: ${state.reason || 'printer error'}`,
        );
      }
      if (Date.now() >= deadline) {
        await this.cancel(jobId).catch(() => undefined);
        throw new Error(
          `CUPS job ${jobId} did not finish within ${Math.round(waitMs / 1000)} seconds and was canceled.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    const outcome = await this.outcome(jobId);
    // Without job history (PreserveJobHistory No) a finished job leaves no trace to inspect.
    if (
      outcome &&
      !outcome.alerts.includes('job-completed-successfully')
    ) {
      throw new Error(
        `CUPS job ${jobId} did not complete (${outcome.alerts.join(', ') || 'unknown state'})${outcome.status ? `: ${outcome.status}` : ''}`,
      );
    }
  }
}
