export const JOB_STATUSES = [
  "queued",
  "printing",
  "printed",
  "failed",
  "expired",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AGENT_WS_PATH = "/agent/ws";
export const agentJobFilePath = (jobId: string): string =>
  `/agent/jobs/${encodeURIComponent(jobId)}/file`;
export const agentJobStatusPath = (jobId: string): string =>
  `/agent/jobs/${encodeURIComponent(jobId)}/status`;

export const HEARTBEAT_INTERVAL_MS = 25_000;
// Agents treat the server as gone after missing roughly two pings.
export const HEARTBEAT_TIMEOUT_MS = 60_000;
export const MAX_ERROR_LENGTH = 500;

export const PRINTER_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface AgentJob {
  id: string;
  title: string;
}

export type ServerMessage =
  | { type: "hello"; printer: { slug: string; name: string } }
  | { type: "jobs"; jobs: AgentJob[] };

export type AgentMessage = { type: "sync" };

export type JobReport =
  | { status: "printed" }
  | { status: "failed"; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAgentJob = (value: unknown): value is AgentJob =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.title === "string";

export function parseServerMessage(raw: string): ServerMessage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (value.type === "hello" && isRecord(value.printer)) {
    const { slug, name } = value.printer;
    if (typeof slug === "string" && typeof name === "string")
      return { type: "hello", printer: { slug, name } };
  }
  if (
    value.type === "jobs" &&
    Array.isArray(value.jobs) &&
    value.jobs.every(isAgentJob)
  ) {
    return { type: "jobs", jobs: value.jobs };
  }
  return undefined;
}

export function parseAgentMessage(raw: string): AgentMessage | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value.type === "sync"
      ? { type: "sync" }
      : undefined;
  } catch {
    return undefined;
  }
}
