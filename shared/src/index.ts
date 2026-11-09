export * from './helpers/index.js';

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
  /** `PUBLIC_URL` is set, so the server can mint enrollment tokens and install commands. */
  enrollment: boolean;
  publicUrl: URL;
  /** Present when the server's static folder has a `logo.{svg,png,jpg}`. */
  logo?: SiteLogo;
}

/** A deployment's logo, shown in the page header. */
export interface SiteLogo {
  /** Root-relative URL of the image. */
  src: string;
  /** Text alternative, from `LOGO_ALT`. */
  alt: string;
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
      /** Failed jobs that still have their document, so they can be retried. */
      failedJobs: number;
    }
  | {
      type: 'jobs-deleted';
      printerId: number;
      count: number;
      activeJobs: number;
      failedJobs: number;
    };

export type JobReport =
  | { status: 'printed' }
  | { status: 'failed'; error: string };

/** Printer fields an agent submits when it enrolls itself. */
export interface EnrollRequest {
  name: string;
  slug: string;
  queue: string;
}

export interface EnrollResponse {
  printer: { slug: string; name: string; queue: string };
  /** Long-lived agent token; shown only once. */
  agentToken: string;
}

/** `POST /api/printers/enroll-token` (admin). */
export interface EnrollTokenResponse {
  token: string;
  expiresAt: string;
  /** `PUBLIC_URL` origin agents connect to. */
  serverUrl: string;
}

/** `PATCH /api/agent/printer`: the agent reports its local queue on start. */
export interface AgentPrinterUpdate {
  queue: string;
}

/** Error body for API failures that carry a machine-readable code. */
export interface ApiError {
  error: string;
  code?: string;
}
