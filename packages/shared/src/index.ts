export * from './helpers/index';

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
  /** `PUBLIC_URL` is set, so the server can mint enrollment tokens and install commands. */
  enrollment: boolean;
  /** Present when the server's static folder has a `logo.{svg,png,jpg}`. */
  logo?: SiteLogo;
  /** Absent when Entra sign-in is not configured. */
  msal?: {
    /** Delegated scope the SPA requests for the admin REST API. */
    apiScope: string;
    authority: string;
    clientId: string;
    tenantId: string;
  };
  publicUrl: URL;
}

/** A deployment's logo, shown in the page header. */
export interface SiteLogo {
  /** Text alternative, from `LOGO_ALT`. */
  alt: string;
  /** Root-relative URL of the image. */
  src: string;
}
/** Print agents, authenticated with their printer's agent token. */
export const AGENT_NAMESPACE = '/agent';
/** Management UI live updates, authenticated with an Entra access token. */
export const LIVE_NAMESPACE = '/live';

/** How often agents ask for queued jobs, in case a push was missed. */
export const SYNC_INTERVAL_MS = 25_000;
export const MAX_ERROR_LENGTH = 500;

export const PRINTER_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Events an agent emits to the server. */
export interface AgentClientEvents {
  sync: () => void;
}

export interface AgentJob {
  id: string;
  title: string;
}

/** `PATCH /api/agent/printer`: the agent reports its local queue on start. */
export interface AgentPrinterUpdate {
  queue: string;
}

/** Events the server emits to an agent on the agent namespace. */
export interface AgentServerEvents {
  hello: (printer: { name: string; slug: string }) => void;
  jobs: (jobs: AgentJob[]) => void;
}

/** Error body for API failures that carry a machine-readable code. */
export interface ApiError {
  code?: string;
  error: string;
}

/** Printer fields an agent submits when it enrolls itself. */
export interface EnrollRequest {
  name: string;
  queue: string;
  slug: string;
}

export interface EnrollResponse {
  /** Long-lived agent token; shown only once. */
  agentToken: string;
  printer: { name: string; queue: string; slug: string };
}

/** `POST /api/printers/enroll-token` (admin). */
export interface EnrollTokenResponse {
  expiresAt: string;
  /** `PUBLIC_URL` origin agents connect to. */
  serverUrl: string;
  token: string;
}

export type JobReport =
  { error: string; status: 'failed' } | { status: 'printed' };

export type LiveEvent =
  | {
      activeJobs: number;
      /** Failed jobs that still have their document, so they can be retried. */
      failedJobs: number;
      jobId: string;
      printerId: number;
      status: JobStatus;
      type: 'job';
    }
  | {
      activeJobs: number;
      count: number;
      failedJobs: number;
      printerId: number;
      type: 'jobs-deleted';
    }
  | {
      lastSeenAt: null | string;
      online: boolean;
      printerId: number;
      type: 'agent';
    }
  | { onlinePrinterIds: number[]; type: 'snapshot' };

/** Events the server emits to management clients on the live namespace. */
export interface LiveServerEvents {
  live: (event: LiveEvent) => void;
}

/** Sent as `connect_error` data when a namespace rejects the handshake. */
export interface SocketAuthError {
  code: string;
  status: number;
}
