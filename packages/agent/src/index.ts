import { setTimeout as delay } from 'node:timers/promises';
import {
  AGENT_NAMESPACE,
  agentJobFilePath,
  agentJobStatusPath,
  parseAgentJobs,
  SOCKET_PATH,
  SYNC_INTERVAL_MS,
  type AgentClientEvents,
  type AgentJob,
  type AgentServerEvents,
  type JobReport,
} from '@uwacwy/print-shared';
import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  filter,
  from,
  map,
  merge,
  Subject,
  tap,
} from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { AGENT_VERSION } from './version.js';
import { acceptsMimeType } from './printer-options/printer-options.js';
import {
  createPrinter,
  type IPrinter,
  type PrintResult,
} from './printer/printer.js';

const USAGE = `Usage: uwacwy-print-agent [env-file]

Connects to a Quick Print server and prints its printer's jobs.
Settings come from the environment, or from env-file when given (existing
environment variables win): PRINT_SERVER_URL, PRINT_AGENT_TOKEN, PRINTER_URI.`;

const [argument] = process.argv.slice(2);
if (argument === '--help' || argument === '-h') {
  console.log(USAGE);
  process.exit(0);
}
if (argument === '--version' || argument === '-v') {
  console.log(AGENT_VERSION);
  process.exit(0);
}
if (argument) {
  process.loadEnvFile(argument);
}

const serverUrlText = process.env.PRINT_SERVER_URL;
const token = process.env.PRINT_AGENT_TOKEN;
const printerUriText = process.env.PRINTER_URI;
if (!serverUrlText || !token || !printerUriText) {
  throw new Error(
    'PRINT_SERVER_URL, PRINT_AGENT_TOKEN, and PRINTER_URI are required.',
  );
}

/** MAX_JOB_MB still works for older installs; `?maxBytes=` on PRINTER_URI wins. */
function printerConnection(uriText: string): URL {
  const uri = new URL(uriText);
  const legacyMb = process.env.MAX_JOB_MB;
  if (legacyMb !== undefined && !uri.searchParams.has('maxBytes')) {
    const bytes = Number(legacyMb) * 1024 * 1024;
    if (!Number.isSafeInteger(bytes) || bytes < 1024 * 1024) {
      throw new Error('MAX_JOB_MB must be a positive size in MB.');
    }
    uri.searchParams.set('maxBytes', String(bytes));
  }
  return uri;
}
const serverUrl = new URL(serverUrlText);
if (
  serverUrl.protocol !== 'https:' &&
  serverUrl.protocol !== 'http:'
) {
  throw new Error('PRINT_SERVER_URL must use HTTP or HTTPS.');
}
const apiOrigin = serverUrl.origin;
type AgentSocket = Socket<AgentServerEvents, AgentClientEvents>;
const JOB_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Jobs from download through acknowledgement, so repeated pushes are ignored. */
const activeJobs = new Set<string>();
const incoming = new Subject<AgentJob>();
let stopping = false;
let currentSocket: AgentSocket | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let retryTimer: NodeJS.Timeout | undefined;
let printer: IPrinter | undefined;

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

async function report(
  jobId: string,
  result: JobReport,
): Promise<void> {
  let retry = 1000;
  while (!stopping) {
    try {
      const response = await fetch(
        new URL(agentJobStatusPath(jobId), apiOrigin),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(result),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok || response.status === 404) {
        return;
      }
      if (response.status < 500) {
        throw new Error(
          `Status report rejected (${response.status}).`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Status report rejected')
      ) {
        throw error;
      }
    }
    await delay(retry);
    retry = Math.min(retry * 2, 30_000);
  }
  throw new Error(
    'Agent is shutting down before status acknowledgement.',
  );
}

async function download(
  job: AgentJob,
  { options }: IPrinter,
): Promise<Buffer> {
  const response = await fetch(
    new URL(agentJobFilePath(job.id), apiOrigin),
    {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Job download failed (${response.status}).`);
  }
  const contentType = response.headers.get('content-type');
  if (!acceptsMimeType(options, contentType)) {
    throw new Error(
      `Printer does not accept ${contentType ?? 'untyped documents'}.`,
    );
  }
  if (
    Number(response.headers.get('content-length') ?? 0) >
    options.maxBytes
  ) {
    throw new Error('Downloaded job exceeds the printer maxBytes.');
  }
  const document = Buffer.from(await response.arrayBuffer());
  if (document.length > options.maxBytes) {
    throw new Error('Downloaded job exceeds the printer maxBytes.');
  }
  if (
    acceptsMimeType(
      { mimeTypes: ['application/pdf'] },
      contentType,
    ) &&
    document.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error('Downloaded job is not a valid PDF.');
  }
  return document;
}

/** Reports a result; if that fails, reconnecting makes the server offer the job again. */
async function acknowledge(result: PrintResult): Promise<void> {
  const { job, ...outcome } = result;
  if (outcome.status === 'failed') {
    log(`Job ${job.id} failed: ${outcome.error}`);
  }
  try {
    await report(job.id, outcome);
    if (outcome.status === 'printed') {
      log(`Submitted job ${job.id} to printer.`);
    }
  } catch (error) {
    log(
      `Could not acknowledge job ${job.id}: ${error instanceof Error ? error.message : error}`,
    );
    currentSocket?.disconnect().connect();
  } finally {
    activeJobs.delete(job.id);
  }
}

/** incoming jobs → download → printer queue → results → acknowledgement. */
function startPipeline(printer: IPrinter): void {
  const downloadFailures = new Subject<PrintResult>();
  incoming
    .pipe(
      filter(
        (job) => JOB_ID.test(job.id) && !activeJobs.has(job.id),
      ),
      tap((job) => activeJobs.add(job.id)),
      concatMap((job) =>
        defer(() => download(job, printer)).pipe(
          map((pdf) => ({ job, pdf })),
          catchError((error: unknown) => {
            downloadFailures.next({
              job,
              status: 'failed',
              error:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : 'Unknown download error',
            });
            return EMPTY;
          }),
        ),
      ),
    )
    .subscribe(({ job, pdf }) => printer.enqueue(job, pdf));

  merge(printer.results$, downloadFailures)
    .pipe(concatMap((result) => from(acknowledge(result))))
    .subscribe();
}

async function run(): Promise<void> {
  printer = createPrinter(printerConnection(printerUriText!));
  await printer.ready();
  log(
    `Agent ${AGENT_VERSION} using ${printer.constructor.name} (max ${(printer.options.maxBytes / 1048576).toFixed(1)} MB, ${printer.options.mimeTypes.join(', ')}).`,
  );
  if (stopping) {
    return;
  }
  startPipeline(printer);
  const websocketBase = new URL(SOCKET_PATH, serverUrl).href;
  console.log('Connecting to '.concat(websocketBase));
  const socket: AgentSocket = io(
    new URL(AGENT_NAMESPACE, serverUrl).href,
    {
      path: SOCKET_PATH,
      transports: ['websocket'],
      auth: { token },
      // Retries are scheduled below so each one can report its delay.
      reconnection: false,
    },
  );
  currentSocket = socket;

  let retryDelay = 1000;
  /** Schedules the next connection attempt and returns the wait in seconds. */
  const reconnect = (): number => {
    clearTimeout(retryTimer);
    const jitter = Math.floor((Math.random() * retryDelay) / 3);
    const wait = retryDelay + jitter;
    retryTimer = setTimeout(() => socket.connect(), wait);
    retryDelay = Math.min(retryDelay * 2, 60_000);
    return Math.max(1, Math.round(wait / 1000));
  };
  const seconds = (count: number) =>
    `${count} second${count === 1 ? '' : 's'}`;

  socket.on('connect', () => {
    retryDelay = 1000;
    log('Connected to print server.');
    socket.emit('sync');
  });
  socket.on('hello', (registered) =>
    log(`Registered for ${registered.name}.`),
  );
  socket.on('jobs', (value) => {
    parseAgentJobs(value)?.forEach((job) => incoming.next(job));
  });
  socket.on('connect_error', (error) => {
    if (stopping) {
      return;
    }
    // Transport failures only say "websocket error"; a rejected handshake says why.
    const detail =
      error.message && error.message !== 'websocket error'
        ? ` (${error.message})`
        : '';
    log(
      `Unable to connect to ${websocketBase}${detail}; retrying in ${seconds(reconnect())}.`,
    );
  });
  socket.on('disconnect', (reason) => {
    if (stopping || reason === 'io client disconnect') {
      return;
    }
    log(
      `Disconnected (${reason}); reconnecting in ${seconds(reconnect())}.`,
    );
  });
  // Picks up jobs whose push was missed, e.g. queued while a dispatch raced a reconnect.
  syncTimer = setInterval(() => {
    if (socket.connected) {
      socket.emit('sync');
    }
  }, SYNC_INTERVAL_MS);
}

function shutdown(): void {
  stopping = true;
  // In-flight work must not keep the agent printing after it was told to stop.
  setTimeout(() => process.exit(0), 5000).unref();
  clearInterval(syncTimer);
  clearTimeout(retryTimer);
  incoming.complete();
  printer?.destroy();
  currentSocket?.disconnect();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
