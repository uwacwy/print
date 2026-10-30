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
import { io, type Socket } from 'socket.io-client';
import { createPrinter, type IPrinter } from './printer/printer.js';

const serverUrlText = process.env.PRINT_SERVER_URL;
const token = process.env.PRINT_AGENT_TOKEN;
const printerUriText = process.env.PRINTER_URI;
const maximumPdfBytes =
  Number(process.env.MAX_JOB_MB ?? 100) * 1024 * 1024;
if (!serverUrlText || !token || !printerUriText) {
  throw new Error(
    'PRINT_SERVER_URL, PRINT_AGENT_TOKEN, and PRINTER_URI are required.',
  );
}
if (
  !Number.isFinite(maximumPdfBytes) ||
  maximumPdfBytes < 1024 * 1024
) {
  throw new Error('MAX_JOB_MB must be a positive size in MB.');
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
const activeJobs = new Set<string>();
let stopping = false;
let currentSocket: AgentSocket | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let retryTimer: NodeJS.Timeout | undefined;
let jobChain = Promise.resolve();
let printer: IPrinter;

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

async function processJob(
  job: AgentJob,
  socket: AgentSocket,
): Promise<void> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      job.id,
    )
  ) {
    return;
  }
  if (activeJobs.has(job.id)) {
    return;
  }
  activeJobs.add(job.id);
  try {
    let printError: unknown;
    try {
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
      const contentLength = Number(
        response.headers.get('content-length') ?? 0,
      );
      if (contentLength > maximumPdfBytes) {
        throw new Error('Downloaded job exceeds MAX_JOB_MB.');
      }
      const pdf = Buffer.from(await response.arrayBuffer());
      if (
        pdf.length > maximumPdfBytes ||
        pdf.subarray(0, 5).toString('ascii') !== '%PDF-'
      ) {
        throw new Error('Downloaded job is not a valid PDF.');
      }
      await printer.print(pdf, job);
    } catch (error) {
      printError = error;
    }
    if (printError) {
      const message =
        printError instanceof Error
          ? printError.message.slice(0, 500)
          : 'Unknown print error';
      log(`Job ${job.id} failed: ${message}`);
      await report(job.id, { status: 'failed', error: message });
    } else {
      await report(job.id, { status: 'printed' });
      log(`Submitted job ${job.id} to printer.`);
    }
  } catch (error) {
    log(
      `Could not process or acknowledge job ${job.id}: ${error instanceof Error ? error.message : error}`,
    );
    // Reconnecting requeues the job on the server, so it is offered again.
    socket.disconnect().connect();
  } finally {
    activeJobs.delete(job.id);
  }
}

async function run(): Promise<void> {
  printer = await createPrinter(printerUriText!, maximumPdfBytes);
  log(`Using ${printer.constructor.name}.`);
  if (stopping) {
    return;
  }
  const socket: AgentSocket = io(
    new URL(AGENT_NAMESPACE, serverUrl).href,
    {
      path: SOCKET_PATH,
      transports: ['websocket'],
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 60_000,
    },
  );
  currentSocket = socket;

  // socket.io retries dropped connections itself, but not rejected handshakes or
  // server-initiated disconnects (a replaced connection, a rotated token, a server reload).
  let retryDelay = 1000;
  const reconnect = () => {
    if (stopping) {
      return;
    }
    clearTimeout(retryTimer);
    const jitter = Math.floor((Math.random() * retryDelay) / 3);
    retryTimer = setTimeout(
      () => socket.connect(),
      retryDelay + jitter,
    );
    retryDelay = Math.min(retryDelay * 2, 60_000);
  };

  socket.on('connect', () => {
    retryDelay = 1000;
    log('Connected to print server.');
    socket.emit('sync');
  });
  socket.on('hello', (registered) =>
    log(`Registered for ${registered.name}.`),
  );
  socket.on('jobs', (value) => {
    const jobs = parseAgentJobs(value);
    if (!jobs) {
      return;
    }
    jobChain = jobChain.then(async () => {
      for (const job of jobs) {
        await processJob(job, socket);
      }
    });
  });
  socket.on('connect_error', (error) => {
    log(`Connection error: ${error.message}`);
    if (!socket.active) {
      reconnect();
    }
  });
  socket.on('disconnect', (reason) => {
    log(`Disconnected (${reason}).`);
    if (reason === 'io server disconnect') {
      reconnect();
    }
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
  currentSocket?.disconnect();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
