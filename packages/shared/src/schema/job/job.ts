import { z } from 'zod';

export const JOB_STATUSES = [
  'queued',
  'printing',
  'printed',
  'failed',
  'expired',
] as const;

export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobId = z.uuid();
export type JobId = z.infer<typeof JobId>;

/** A job the server asks an agent to print. */
export const AgentJob = z.object({
  id: z.string(),
  title: z.string(),
});
export type AgentJob = z.infer<typeof AgentJob>;

/** `POST /api/agent/jobs/:id/status`: how printing went. */
export const JobReport = z.discriminatedUnion('status', [
  z.object({ error: z.string(), status: z.literal('failed') }),
  z.object({ status: z.literal('printed') }),
]);
export type JobReport = z.infer<typeof JobReport>;

export const SubmittedJob = z.object({
  agentOnline: z.boolean(),
  jobId: z.string(),
  title: z.string(),
});
export type SubmittedJob = z.infer<typeof SubmittedJob>;

export const QueuedQrSheet = z.object({
  agentOnline: z.boolean(),
  jobId: z.string(),
});
export type QueuedQrSheet = z.infer<typeof QueuedQrSheet>;
