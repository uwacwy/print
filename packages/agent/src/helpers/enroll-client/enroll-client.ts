import type { z } from 'zod';

import {
  $,
  type AgentPrinterUpdate,
  AgentPrinterView,
  EnrollRequest,
  EnrollResponse,
  parseWith,
} from '@uwacwy/print-shared';

export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/** The queue as stored by the server: no credentials, driver options, or fragment. */
export function queueForReport(uri: string): string {
  const url = new URL(uri);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.href;
}

/** A readable error from an API response body (`{ error, code }`) or the bare status. */
export function serverError(
  status: number,
  body: unknown,
): ServerError {
  const { code, error } =
    body && typeof body === 'object'
      ? (body as { code?: unknown; error?: unknown })
      : {};
  return new ServerError(
    typeof error === 'string' && error
      ? error
      : `The print server answered ${status}.`,
    status,
    typeof code === 'string' ? code : undefined,
  );
}

async function request<S extends z.ZodType>(
  serverUrl: string,
  path: string,
  init: { body: unknown; method: string; token: string },
  schema: S,
): Promise<z.output<S>> {
  const url = new URL(path, serverUrl);
  const response = await fetch(url, {
    body: JSON.stringify(init.body),
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${init.token}`,
      'content-type': 'application/json',
    },
    method: init.method,
    signal: AbortSignal.timeout(30_000),
  }).catch((error: unknown) => {
    const cause = (error as { cause?: { message?: string } })
      ?.cause?.message;
    throw new Error(
      `Could not reach ${url.origin}: ${cause ?? (error instanceof Error ? error.message : String(error))}`,
    );
  });
  const body: unknown = await response
    .json()
    .catch(() => undefined);
  if (!response.ok) {
    throw serverError(response.status, body);
  }
  return parseWith(schema)(body);
}

/** Exchanges an enrollment token for a new printer and its long-lived agent token. */
export const enroll = (
  serverUrl: string,
  enrollToken: string,
  printer: EnrollRequest,
): Promise<EnrollResponse> =>
  request(
    serverUrl,
    $.api.agent.enroll(),
    {
      body: { ...printer, queue: queueForReport(printer.queue) },
      method: 'POST',
      token: enrollToken,
    },
    EnrollResponse,
  );

/** Tells the server which queue the agent prints to; doubles as an agent token check. */
export const reportQueue = (
  serverUrl: string,
  agentToken: string,
  printerUri: string,
): Promise<AgentPrinterView> =>
  request(
    serverUrl,
    $.api.agent.printer(),
    {
      body: {
        queue: queueForReport(printerUri),
      } satisfies AgentPrinterUpdate,
      method: 'PATCH',
      token: agentToken,
    },
    AgentPrinterView,
  );
