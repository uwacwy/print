const plural = (count: number) => (count === 1 ? 'job' : 'jobs');

export const qrSheetNotice = (
  name: string,
  agentOnline: boolean,
) =>
  agentOnline
    ? $localize`:@@printer-messages.qr-sheet-sent:QR sheet sent to ${name}:name:.`
    : $localize`:@@printer-messages.qr-sheet-queued:QR sheet queued. It prints when the ${name}:name: agent is online.`;

export const tokenRotatedNotice = (name: string) =>
  $localize`:@@printer-messages.token-rotated:Agent token rotated for ${name}:name:. Copy the new token below.`;

export const retriedNotice = (name: string, retried: number) =>
  retried
    ? $localize`:@@printer-messages.retried:Retried ${retried}:retried: ${plural(retried)}:retried2: for ${name}:name:.`
    : $localize`:@@printer-messages.nothing-retried:No failed jobs for ${name}:name: could be retried; their documents have expired.`;

export const jobsDeletedNotice = (
  name: string,
  deleted: number,
) => `Deleted ${deleted} ${plural(deleted)} for ${name}.`;

export const printerRemovedNotice = (name: string) =>
  `${name} removed.`;

export const rotateTokenPrompt = (name: string) =>
  `Rotate the agent token for ${name}? Its agent disconnects until it is reconfigured with the new token.`;

export const deleteJobsPrompt = (name: string) =>
  `Delete all jobs for ${name}? Queued and in-progress documents will not print, and job history is removed.`;

export const removePrinterPrompt = (name: string) =>
  `Remove ${name} and all of its jobs? This cannot be undone.`;
