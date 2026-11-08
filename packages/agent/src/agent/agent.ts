import { setTimeout as delay } from 'node:timers/promises';
import {
  AGENT_NAMESPACE,
  agentJobFilePath,
  agentJobStatusPath,
  parseAgentJobs,
  SOCKET_PATH,
  SYNC_INTERVAL_MS,
  type AgentJob,
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
import { io } from 'socket.io-client';
import {
  checkDownloadedDocument,
  checkDownloadHeaders,
  isJobId,
} from '../helpers/jobs/jobs';
import { log } from '../helpers/logging';
import {
  connectErrorDetail,
  formatSeconds,
  INITIAL_RETRY_MS,
  nextRetryDelay,
  toWholeSeconds,
  withJitter,
} from '../helpers/reconnect/reconnect';
import { errorMessage } from '../helpers/text/text';
import { createPrinter } from '../helpers/create-printer/create-printer';
import { reportQueue } from '../helpers/enroll-client/enroll-client';
import type { AgentConfig } from '../helpers/config/config';
import type {
  AgentSocket,
  IPrinter,
  PrintRequest,
  PrintResult,
} from '../types';
import { AGENT_VERSION } from '../version';

/**
 * Connects to the print server and prints this printer's jobs until SIGINT/SIGTERM.
 * Resolves once the printer is ready and the WebSocket is connecting.
 */
export function startAgent(config: AgentConfig): Promise<void> {
  const serverUrl = new URL(config.PRINT_SERVER_URL);
  const apiOrigin = serverUrl.origin;
  /** Jobs from download through acknowledgement, so repeated pushes are ignored. */
  const activeJobs = new Set<string>();
  const incoming = new Subject<AgentJob>();
  /** Downloaded jobs for the printer; completing it drops any not yet printing. */
  const requests = new Subject<PrintRequest>();
  let stopping = false;
  let currentSocket: AgentSocket | undefined;
  let syncTimer: NodeJS.Timeout | undefined;
  let retryTimer: NodeJS.Timeout | undefined;

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
              authorization: `Bearer ${config.PRINT_AGENT_TOKEN}`,
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
        headers: {
          authorization: `Bearer ${config.PRINT_AGENT_TOKEN}`,
        },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Job download failed (${response.status}).`);
    }
    const contentType = response.headers.get('content-type');
    checkDownloadHeaders(
      {
        contentType,
        contentLength: response.headers.get('content-length'),
      },
      options,
    );
    return checkDownloadedDocument(
      contentType,
      Buffer.from(await response.arrayBuffer()),
      options,
    );
  }

  /** Reports a result; if that fails, reconnecting makes the server offer the job again. */
  async function acknowledge(result: PrintResult): Promise<void> {
    const { job, ...outcome } = result;
    if (outcome.status === 'failed') {
      log(`[job:${job.id}] Failed: ${outcome.error}`);
    }
    try {
      await report(job.id, outcome);
      if (outcome.status === 'printed') {
        log(`[job:${job.id}] Submitted to printer.`);
      }
    } catch (error) {
      log(
        `[job:${job.id}] Could not acknowledge job: ${errorMessage(error, String(error))}`,
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
        filter((job) => isJobId(job.id) && !activeJobs.has(job.id)),
        tap((job) => activeJobs.add(job.id)),
        concatMap((job) =>
          defer(() => download(job, printer)).pipe(
            map((pdf) => ({ job, pdf })),
            catchError((error: unknown) => {
              downloadFailures.next({
                job,
                status: 'failed',
                error: errorMessage(error, 'Unknown download error'),
              });
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe((request) => requests.next(request));

    merge(printer.results$, downloadFailures)
      .pipe(concatMap((result) => from(acknowledge(result))))
      .subscribe();
  }

  const websocketBase = new URL(SOCKET_PATH, serverUrl).href;

  async function run(): Promise<void> {
    log(`[agent] uwacwy-print-agent ${AGENT_VERSION}`);

    log(`[printer] Connecting: ${config.PRINTER_URI}`);
    const printer = createPrinter(config.PRINTER_URI, requests);
    await printer.ready();
    log(`[printer] Connected: ${config.PRINTER_URI}`);
    void reportQueue(
      config.PRINT_SERVER_URL,
      config.PRINT_AGENT_TOKEN,
      config.PRINTER_URI,
    ).then(
      () => log('[server] Reported printer queue.'),
      (error: unknown) =>
        log(
          `[server] Could not report printer queue: ${errorMessage(error, String(error))}`,
        ),
    );

    if (stopping) {
      return;
    }

    startPipeline(printer);

    log(`[ws] Connecting: ${websocketBase}`);
    const socket: AgentSocket = io(
      new URL(AGENT_NAMESPACE, config.PRINT_SERVER_URL).href,
      {
        path: SOCKET_PATH,
        transports: ['websocket'],
        auth: { token: config.PRINT_AGENT_TOKEN },
        // Retries are scheduled below so each one can report its delay.
        reconnection: false,
      },
    );
    currentSocket = socket;

    let retryDelay = INITIAL_RETRY_MS;
    /** Schedules the next connection attempt and describes the wait, e.g. "2 seconds". */
    const reconnect = (): string => {
      clearTimeout(retryTimer);
      const wait = withJitter(retryDelay);
      retryTimer = setTimeout(() => socket.connect(), wait);
      retryDelay = nextRetryDelay(retryDelay);
      return formatSeconds(toWholeSeconds(wait));
    };

    socket
      .on('connect', () => {
        retryDelay = INITIAL_RETRY_MS;
        log(`[ws] Connected: ${websocketBase}`);
        socket.emit('sync');
      })
      .on('hello', (registered) =>
        log(
          `[ws] Listening to queue: '${new URL(`/print/${registered.slug}`, websocketBase).href}' => '${registered.name}'`,
        ),
      )
      .on('jobs', (value) => {
        parseAgentJobs(value)?.forEach((job) => incoming.next(job));
      })
      .on('connect_error', (error) => {
        if (stopping) {
          return;
        }
        log(
          `[ws] Unable to connect to ${websocketBase}${connectErrorDetail(error)}; retrying in ${reconnect()}.`,
        );
      })
      .on('disconnect', (reason) => {
        if (stopping || reason === 'io client disconnect') {
          return;
        }
        log(
          `[ws] Disconnected (${reason}); reconnecting in ${reconnect()}.`,
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
    requests.complete();
    currentSocket?.disconnect();
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return run();
}
