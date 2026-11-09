import type { LiveEvent } from '../../services/live-events/live-events.service';

export interface PrinterLiveStatus {
  online: boolean;
  activeJobs: number;
  failedJobs: number;
  lastSeenAt: string | null;
}

/** Folds a live event into the status of the printer with `printerId`; other printers' events are ignored. */
export function applyLiveEvent<T extends PrinterLiveStatus>(
  status: T,
  event: LiveEvent,
  printerId: number,
): T {
  if (event.type === 'snapshot') {
    const online = event.onlinePrinterIds.includes(printerId);
    return online === status.online ? status : { ...status, online };
  }
  if (event.printerId !== printerId) {
    return status;
  }
  return event.type === 'agent'
    ? {
        ...status,
        online: event.online,
        lastSeenAt: event.lastSeenAt ?? status.lastSeenAt,
      }
    : {
        ...status,
        activeJobs: event.activeJobs,
        failedJobs: event.failedJobs,
      };
}
