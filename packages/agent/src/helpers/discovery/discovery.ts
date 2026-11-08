import {
  humanQueueName,
  parseQueueDescriptions,
  parseQueueList,
  runCups,
} from '../cups/cups';

export type PrinterKind = 'cups' | 'ipp';

export interface DiscoveredPrinter {
  /** A `PRINTER_URI` value. */
  uri: string;
  /** Person-friendly name; the default printer name when enrolling. */
  name: string;
  detail?: string;
}

export interface Discovery {
  kind: PrinterKind;
  printers: DiscoveredPrinter[];
  /** Why discovery failed, e.g. CUPS is not installed. */
  error?: string;
}

const LPSTAT_TIMEOUT_MS = 15_000;

/** Installed CUPS queues plus driverless printers CUPS can use on demand. */
export async function listCupsPrinters(): Promise<
  DiscoveredPrinter[]
> {
  const [queues, descriptions] = await Promise.all([
    runCups('lpstat', ['-e'], LPSTAT_TIMEOUT_MS),
    // Driverless (-e only) destinations make `lpstat -p` fail; their names are still listed.
    runCups('lpstat', ['-l', '-p'], LPSTAT_TIMEOUT_MS).catch(
      () => '',
    ),
  ]);
  return cupsPrinters(
    parseQueueList(queues),
    parseQueueDescriptions(descriptions),
  );
}

export const cupsPrinters = (
  queues: readonly string[],
  descriptions: ReadonlyMap<string, string>,
): DiscoveredPrinter[] =>
  queues.map((queue) => ({
    uri: `cups://${queue}`,
    name: humanQueueName(queue, descriptions.get(queue)),
    detail: queue,
  }));

const describeFailure = (
  kind: PrinterKind,
  error: unknown,
): string => {
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return 'CUPS client tools (lpstat) are not installed; try sudo apt install cups-client.';
  }
  const message =
    error instanceof Error ? error.message : String(error);
  return kind === 'cups'
    ? `Could not list CUPS queues: ${message}`
    : `Could not browse for IPP printers: ${message}`;
};

/** Never rejects: a failing source reports its error alongside the others' printers. */
export async function discover(
  kinds: readonly PrinterKind[],
  { mdnsTimeoutMs }: { mdnsTimeoutMs?: number } = {},
): Promise<Discovery[]> {
  const sources: Record<
    PrinterKind,
    () => Promise<DiscoveredPrinter[]>
  > = {
    cups: listCupsPrinters,
    ipp: async () =>
      (await import('../mdns/mdns')).browseIpp(mdnsTimeoutMs),
  };
  return Promise.all(
    kinds.map((kind) =>
      sources[kind]().then(
        (printers): Discovery => ({ kind, printers }),
        (error: unknown): Discovery => ({
          kind,
          printers: [],
          error: describeFailure(kind, error),
        }),
      ),
    ),
  );
}

const KIND_LABEL: Record<PrinterKind, string> = {
  cups: 'CUPS queues',
  ipp: 'IPP printers on the network',
};

/** Plain-text listing for errors and `list-queues`. */
export function formatDiscovery(
  discoveries: readonly Discovery[],
): string {
  return discoveries
    .map(({ kind, printers, error }) => {
      const lines = printers.map(
        ({ uri, name }) =>
          `  ${uri}${name !== uri ? `  (${name})` : ''}`,
      );
      return [
        `${KIND_LABEL[kind]}:`,
        ...(error ? [`  ${error}`] : []),
        ...(lines.length || error ? lines : ['  (none found)']),
      ].join('\n');
    })
    .join('\n');
}

/** `cups://Queue?options` → `Queue`; `undefined` for other schemes. */
export function cupsQueueName(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    return url.protocol === 'cups:' ? url.hostname : undefined;
  } catch {
    return undefined;
  }
}

/** A printer's discovered name, else its CUPS queue or host: the default name when enrolling. */
export function defaultPrinterName(
  uri: string,
  printers: readonly DiscoveredPrinter[],
): string {
  const found = printers.find((printer) => printer.uri === uri);
  if (found) {
    return found.name;
  }
  const queue = cupsQueueName(uri);
  return queue
    ? queue.replace(/[_-]+/g, ' ')
    : new URL(uri).hostname;
}

export interface QueueProblem {
  message: string;
  /** CUPS answered and the queue is not there (as opposed to CUPS being unreachable). */
  missing: boolean;
}

/** Why a `cups://` printer URI cannot work here (listing the queues that can), or `undefined`. */
export async function cupsQueueProblem(
  uri: string,
): Promise<QueueProblem | undefined> {
  const queue = cupsQueueName(uri);
  return queue
    ? missingQueueProblem(queue, await discover(['cups']))
    : undefined;
}

export function missingQueueProblem(
  queue: string,
  discoveries: readonly Discovery[],
): QueueProblem | undefined {
  const [cups] = discoveries;
  if (
    !cups ||
    cups.printers.some(
      (printer) => printer.uri === `cups://${queue}`,
    )
  ) {
    return undefined;
  }
  return cups.error
    ? { message: cups.error, missing: false }
    : {
        message: `CUPS has no queue named ${queue}.\n${formatDiscovery(discoveries)}`,
        missing: true,
      };
}
