import type { AgentJob } from '../../index';

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

const isAgentJob = (value: unknown): value is AgentJob =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  typeof value['title'] === 'string';

/** Validates a pushed job list before the agent acts on it. */
export const parseAgentJobs = (
  value: unknown,
): AgentJob[] | undefined =>
  Array.isArray(value) && value.every(isAgentJob)
    ? value
    : undefined;
