import { z } from 'zod';

import { PrinterInput, PrinterQueue } from '../printer/printer';

/** Printer fields an agent submits when it enrolls itself. */
export const EnrollRequest = PrinterInput.pick({
  name: true,
  queue: true,
  slug: true,
});
export type EnrollRequest = z.infer<typeof EnrollRequest>;

/** What the server stores for an agent's printer; not re-validated on the way out. */
export const AgentPrinterView = z.object({
  name: z.string(),
  queue: z.string(),
  slug: z.string(),
});
export type AgentPrinterView = z.infer<typeof AgentPrinterView>;

export const EnrollResponse = z.object({
  /** Long-lived agent token; shown only once. */
  agentToken: z.string(),
  printer: AgentPrinterView,
});
export type EnrollResponse = z.infer<typeof EnrollResponse>;

/** `POST /api/printers/enroll-token` (admin). */
export const EnrollTokenResponse = z.object({
  expiresAt: z.string(),
  /** `PUBLIC_URL` origin agents connect to. */
  serverUrl: z.string(),
  token: z.string(),
});
export type EnrollTokenResponse = z.infer<
  typeof EnrollTokenResponse
>;

/** `PATCH /api/agent/printer`: the agent reports its local queue on start. */
export const AgentPrinterUpdate = z.object({
  queue: PrinterQueue,
});
export type AgentPrinterUpdate = z.infer<
  typeof AgentPrinterUpdate
>;

/** Sent on the agent namespace once the agent token checks out. */
export const AgentHello = z.object({
  name: z.string(),
  slug: z.string(),
});
export type AgentHello = z.infer<typeof AgentHello>;
