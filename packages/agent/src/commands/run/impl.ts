import { homedir } from 'node:os';

import type { RunFlags } from './command';

import { startAgent } from '../../agent/agent';
import { isInteractive, type LocalContext } from '../../context';
import {
  CliError,
  EXIT_USAGE,
  expectedFailure,
} from '../../helpers/cli-error/cli-error';
import {
  firstWritable,
  loadConfigFile,
  writeConfig,
} from '../../helpers/config-file/config-file';
import {
  type AgentConfig,
  configCandidates,
  configErrors,
  defaultWriteTarget,
  isComplete,
  mergeConfig,
  missingKeys,
  missingSettingsMessage,
  type PartialAgentConfig,
} from '../../helpers/config/config';
import {
  cupsQueueProblem,
  discover,
  formatDiscovery,
} from '../../helpers/discovery/discovery';
import { log } from '../../helpers/logging';

export default function run(
  this: LocalContext,
  flags: RunFlags,
): Promise<Error | void> {
  return main(this, flags).catch(expectedFailure);
}

/** Prompts at a terminal for what is missing and saves it, so the next run needs no prompts. */
async function completeConfig(
  context: LocalContext,
  config: PartialAgentConfig,
  target: string | undefined,
  candidates: string[],
): Promise<AgentConfig> {
  const missing = missingKeys(config);
  if (!isInteractive(context)) {
    const printers = missing.includes('PRINTER_URI')
      ? formatDiscovery(
          await discover(['cups', 'ipp'], {
            mdnsTimeoutMs: 3000,
          }),
        )
      : undefined;
    throw new CliError(
      missingSettingsMessage(missing, candidates, printers),
      EXIT_USAGE,
    );
  }
  console.error(`Missing settings: ${missing.join(', ')}.`);
  const prompts = await import('../../prompts/prompts');
  const complete: AgentConfig = {
    PRINT_AGENT_TOKEN:
      config.PRINT_AGENT_TOKEN ??
      (await prompts.promptAgentToken()),
    PRINT_SERVER_URL:
      config.PRINT_SERVER_URL ??
      (await prompts.promptServerUrl()),
    PRINTER_URI:
      config.PRINTER_URI ?? (await prompts.choosePrinter()).uri,
  };
  const path =
    target ??
    (await firstWritable(
      defaultWriteTarget(
        context.process.getuid?.() ?? -1,
        candidates,
      ),
      candidates,
    ));
  if (path) {
    await writeConfig(path, complete, {
      mode: 0o600,
      preserve: true,
    });
    log(`[config] Saved settings to ${path}`);
  } else {
    log(
      '[config] Warning: no writable config location; settings were not saved.',
    );
  }
  return complete;
}

async function main(
  context: LocalContext,
  flags: RunFlags,
): Promise<void> {
  const { env } = context.process;
  const candidates = configCandidates(env, homedir());
  const file = await loadConfigFile(flags.config, candidates);
  if (file) {
    log(`[config] Using ${file.path}`);
    if (file.warning) {
      log(`[config] Warning: ${file.warning}`);
    }
  }
  const merged = mergeConfig(env, file?.values ?? {});
  const config = isComplete(merged)
    ? merged
    : await completeConfig(
        context,
        merged,
        flags.config ?? file?.path,
        candidates,
      );

  const errors = configErrors(config, {
    insecure: flags.insecure,
  });
  if (errors.length) {
    throw new CliError(errors.join('\n'), EXIT_USAGE);
  }
  const problem = await cupsQueueProblem(config.PRINTER_URI);
  if (problem?.missing) {
    throw new CliError(problem.message, EXIT_USAGE);
  }
  if (problem) {
    // CUPS may still be starting; the driver retries until it answers.
    log(`[printer] Warning: ${problem.message}`);
  }
  await startAgent(config);
}
