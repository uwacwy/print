import { z } from 'zod';

import { JobStatus } from '../job/job';

/** A change the server pushes to management clients. */
export const LiveEvent = z.discriminatedUnion('type', [
  z.object({
    activeJobs: z.number(),
    /** Failed jobs that still have their document, so they can be retried. */
    failedJobs: z.number(),
    jobId: z.string(),
    printerId: z.number(),
    status: JobStatus,
    type: z.literal('job'),
  }),
  z.object({
    activeJobs: z.number(),
    count: z.number(),
    failedJobs: z.number(),
    printerId: z.number(),
    type: z.literal('jobs-deleted'),
  }),
  z.object({
    lastSeenAt: z.string().nullable(),
    online: z.boolean(),
    printerId: z.number(),
    type: z.literal('agent'),
  }),
  z.object({
    onlinePrinterIds: z.array(z.number()),
    type: z.literal('snapshot'),
  }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;
