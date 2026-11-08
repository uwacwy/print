import type { LocalContext } from '../../context';
import {
  CliError,
  EXIT_USAGE,
} from '../../helpers/cli-error/cli-error';
import {
  discover,
  formatDiscovery,
  type PrinterKind,
} from '../../helpers/discovery/discovery';
import type { ListQueuesFlags } from './command';

export default async function listQueues(
  this: LocalContext,
  { cups, ipp, json, timeout }: ListQueuesFlags,
): Promise<void | Error> {
  if (!(timeout > 0 && timeout <= 60)) {
    return new CliError(
      '--timeout must be between 0 and 60 seconds.',
      EXIT_USAGE,
    );
  }
  const kinds: PrinterKind[] =
    cups || ipp
      ? [
          ...(cups ? ['cups' as const] : []),
          ...(ipp ? ['ipp' as const] : []),
        ]
      : ['cups', 'ipp'];
  const discoveries = await discover(kinds, {
    mdnsTimeoutMs: timeout * 1000,
  });
  this.process.stdout.write(
    `${json ? JSON.stringify(discoveries, null, 2) : formatDiscovery(discoveries)}\n`,
  );
}
