import { LiveEvent } from '@uwacwy/print-shared';

export interface PrinterLiveStatus {
  activeJobs: number;
  failedJobs: number;
  lastSeenAt: null | string;
  online: boolean;
}

/** Folds a live event into the status of the printer with `printerId`; other printers' events are ignored. */
export function applyLiveEvent<T extends PrinterLiveStatus>(
  status: T,
  event: LiveEvent,
  printerId: number,
): T {
  if (event.type === 'snapshot') {
    const online = event.onlinePrinterIds.includes(printerId);
    return online === status.online
      ? status
      : { ...status, online };
  }
  if (event.printerId !== printerId) {
    return status;
  }
  return event.type === 'agent'
    ? {
        ...status,
        lastSeenAt: event.lastSeenAt ?? status.lastSeenAt,
        online: event.online,
      }
    : {
        ...status,
        activeJobs: event.activeJobs,
        failedJobs: event.failedJobs,
      };
}
