import {
  agentSetupCommands,
  type SetupCommand,
} from '@uwacwy/print-shared';
import type { CreatedPrinter } from '../../../../services/printer/printer.service';

/** The agent token, plus ready-made setup commands when the server knows its public URL. */
export function createdPrinterCommands({
  printer,
  agentToken,
  serverUrl,
}: CreatedPrinter): SetupCommand[] {
  return [
    { id: 'token', label: 'Agent token', command: agentToken },
    ...(serverUrl
      ? agentSetupCommands({
          serverUrl,
          agentToken,
          printerUri: printer.queue,
          slug: printer.slug,
        })
      : []),
  ];
}
