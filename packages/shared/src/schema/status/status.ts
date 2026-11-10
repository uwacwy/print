import { z } from 'zod';

/** Public server status from `GET /api/status`. */
export const ServerStatus = z.object({
  /** Printers whose agent is currently connected. */
  printersOnline: z.number().int().nonnegative(),
});
export type ServerStatus = z.infer<typeof ServerStatus>;
