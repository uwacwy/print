import type { LiveEvent } from '../../../../services/live-events/live-events.service';

export interface PrinterLiveStatus {
  online: boolean;
  activeJobs: number;
}

/** Folds a live event into the status of the printer with `printerId`; other printers' events are ignored. */
export function applyLiveEvent(
  status: PrinterLiveStatus,
  event: LiveEvent,
  printerId: number,
): PrinterLiveStatus {
  if (event.type === 'snapshot') {
    return {
      ...status,
      online: event.onlinePrinterIds.includes(printerId),
    };
  }
  if (event.printerId !== printerId) {
    return status;
  }
  return event.type === 'agent'
    ? { ...status, online: event.online }
    : { ...status, activeJobs: event.activeJobs };
}
