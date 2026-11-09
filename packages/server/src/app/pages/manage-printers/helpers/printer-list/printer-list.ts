import type { PrinterSummary } from '../../../../services/printer/printer.service';
import { applyLiveEvent } from '../../../../helpers/printer-live-status/printer-live-status';
import type { LiveEvent } from '../../../../services/live-events/live-events.service';

export const patchPrinter = (
  printers: readonly PrinterSummary[],
  id: number,
  changes: Partial<PrinterSummary>,
): PrinterSummary[] =>
  printers.map((printer) =>
    printer.id === id ? { ...printer, ...changes } : printer,
  );

export const withoutPrinter = (
  printers: readonly PrinterSummary[],
  id: number,
): PrinterSummary[] => printers.filter((printer) => printer.id !== id);

/** Applies a live event to every printer it concerns. */
export const applyLiveEventToList = (
  printers: readonly PrinterSummary[],
  event: LiveEvent,
): PrinterSummary[] =>
  printers.map((printer) => applyLiveEvent(printer, event, printer.id));

/** Screen reader text for events worth announcing, or '' for the rest. */
export function liveEventAnnouncement(
  printers: readonly PrinterSummary[],
  event: LiveEvent,
): string {
  if (event.type === 'snapshot') {
    return '';
  }
  const name = printers.find(({ id }) => id === event.printerId)?.name;
  if (!name) {
    return '';
  }
  switch (event.type) {
    case 'agent':
      return `${name} agent ${event.online ? 'connected' : 'disconnected'}.`;
    case 'job':
      return event.status === 'printed' || event.status === 'failed'
        ? `A job ${event.status} on ${name}.`
        : '';
    case 'jobs-deleted':
      return `${event.count} ${event.count === 1 ? 'job' : 'jobs'} deleted on ${name}.`;
  }
}
