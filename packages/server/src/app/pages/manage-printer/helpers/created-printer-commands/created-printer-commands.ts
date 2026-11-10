import {
  agentSetupCommands,
  type CreatedPrinter,
  type SetupCommand,
} from '@uwacwy/print-shared';

/** The agent token, plus ready-made setup commands when the server knows its public URL. */
export function createdPrinterCommands({
  agentToken,
  printer,
  serverUrl,
}: CreatedPrinter): SetupCommand[] {
  return [
    {
      command: agentToken,
      id: 'token',
      label: $localize`:@@setup-command.agent-token:Agent token`,
    },
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
