import {
  agentSetupCommands,
  type SetupCommand,
} from '@uwacwy/print-shared';

import type { CreatedPrinter } from '../../../../services/printer/printer.service';

/** The agent token, plus ready-made setup commands when the server knows its public URL. */
export function createdPrinterCommands({
  agentToken,
  printer,
  serverUrl,
}: CreatedPrinter): SetupCommand[] {
  return [
    { command: agentToken, id: 'token', label: 'Agent token' },
    ...(serverUrl
      ? agentSetupCommands({
          agentToken,
          printerUri: printer.queue,
          serverUrl,
          slug: printer.slug,
        })
      : []),
  ];
}
