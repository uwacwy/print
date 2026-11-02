export const JOB_STATUSES = [
  'queued',
  'printing',
  'printed',
  'failed',
  'expired',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** socket.io endpoint shared by every namespace; the dev proxy forwards it to the socket server. */
export const SOCKET_PATH = '/ws';

/** `GET /api/client-config`: browser sign-in settings the server reads from its environment at runtime. */
export interface ClientConfig {
  /** Absent when Entra sign-in is not configured. */
  msal?: {
    tenantId: string;
    clientId: string;
    authority: string;
    /** Delegated scope the SPA requests for the admin REST API. */
    apiScope: string;
  };
}
/** Print agents, authenticated with their printer's agent token. */
export const AGENT_NAMESPACE = '/agent';
/** Management UI live updates, authenticated with an Entra access token. */
export const LIVE_NAMESPACE = '/live';

export const agentJobFilePath = (jobId: string): string =>
  `/agent/jobs/${encodeURIComponent(jobId)}/file`;
export const agentJobStatusPath = (jobId: string): string =>
  `/agent/jobs/${encodeURIComponent(jobId)}/status`;

/** How often agents ask for queued jobs, in case a push was missed. */
export const SYNC_INTERVAL_MS = 25_000;
export const MAX_ERROR_LENGTH = 500;

export const PRINTER_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface AgentJob {
  id: string;
  title: string;
}

/** Events the server emits to an agent on the agent namespace. */
export interface AgentServerEvents {
  hello: (printer: { slug: string; name: string }) => void;
  jobs: (jobs: AgentJob[]) => void;
}

/** Events an agent emits to the server. */
export interface AgentClientEvents {
  sync: () => void;
}

/** Events the server emits to management clients on the live namespace. */
export interface LiveServerEvents {
  live: (event: LiveEvent) => void;
}

/** Sent as `connect_error` data when a namespace rejects the handshake. */
export interface SocketAuthError {
  code: string;
  status: number;
}

export type LiveEvent =
  | { type: 'snapshot'; onlinePrinterIds: number[] }
  | {
      type: 'agent';
      printerId: number;
      online: boolean;
      lastSeenAt: string | null;
    }
  | {
      type: 'job';
      printerId: number;
      jobId: string;
      status: JobStatus;
      activeJobs: number;
    }
  | {
      type: 'jobs-deleted';
      printerId: number;
      count: number;
      activeJobs: number;
    };

export type JobReport =
  | { status: 'printed' }
  | { status: 'failed'; error: string };

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

const isAgentJob = (value: unknown): value is AgentJob =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string';

/** Validates a pushed job list before the agent acts on it. */
export const parseAgentJobs = (
  value: unknown,
): AgentJob[] | undefined =>
  Array.isArray(value) && value.every(isAgentJob)
    ? value
    : undefined;
