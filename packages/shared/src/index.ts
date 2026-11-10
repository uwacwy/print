import type {
  AgentHello,
  AgentJob,
  LiveEvent,
} from './schema/index';

import { $ } from './routes/routes';

export * from './helpers/index';
export * from './routes/index';
export * from './schema/index';

/** socket.io endpoint shared by every namespace; the dev proxy forwards it to the socket server. */
export const SOCKET_PATH = $.ws();

/** Print agents, authenticated with their printer's agent token. */
export const AGENT_NAMESPACE = '/agent';
/** Management UI live updates, authenticated with an Entra access token. */
export const LIVE_NAMESPACE = '/live';

/** How often agents ask for queued jobs, in case a push was missed. */
export const SYNC_INTERVAL_MS = 25_000;
export const MAX_ERROR_LENGTH = 500;

/** Events an agent emits to the server. */
export interface AgentClientEvents {
  sync: () => void;
}

/** Events the server emits to an agent on the agent namespace. */
export interface AgentServerEvents {
  hello: (printer: AgentHello) => void;
  jobs: (jobs: AgentJob[]) => void;
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
