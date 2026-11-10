import {
  isAllowedServerUrl,
  slugify,
} from '@uwacwy/print-shared';
import { homedir } from 'node:os';

import type { InstallFlags } from './command';

import { isInteractive, type LocalContext } from '../../context';
import {
  CliError,
  EXIT_USAGE,
  expectedFailure,
} from '../../helpers/cli-error/cli-error';
import {
  configExists,
  firstWritable,
  writeConfig,
} from '../../helpers/config-file/config-file';
import {
  type AgentConfig,
  configCandidates,
  defaultWriteTarget,
  missingSettingsMessage,
} from '../../helpers/config/config';
import {
  cupsQueueName,
  defaultPrinterName,
  discover,
  type DiscoveredPrinter,
  formatDiscovery,
  missingQueueProblem,
} from '../../helpers/discovery/discovery';
import {
  enroll,
  reportQueue,
  ServerError,
} from '../../helpers/enroll-client/enroll-client';
import {
  parseAgentToken,
  parseEnrollToken,
  parseName,
  parsePrinterUri,
  parseServerUrl,
} from '../../helpers/flag-parsers/flag-parsers';
import {
  MIN_NODE_VERSION,
  satisfiesMinimum,
} from '../../helpers/node-version/node-version';
import { serviceScope } from '../../helpers/systemd/systemd';

type Env = NodeJS.ProcessEnv;
type Prompts = typeof import('../../prompts/prompts');

export default function install(
  this: LocalContext,
  flags: InstallFlags,
): Promise<Error | void> {
  return main(this, flags).catch(expectedFailure);
}

async function enrollPrinter(
  serverUrl: string,
  enrollToken: string,
  printer: DiscoveredPrinter,
  flags: InstallFlags,
  prompts: Prompts | undefined,
): Promise<{ agentToken: string; name: string; slug: string }> {
  const name =
    flags.name ??
    (prompts
      ? await prompts.promptName(printer.name)
      : defaultName(printer.name));
  let slug =
    flags.slug ??
    (prompts ? await prompts.promptSlug(name) : slugify(name));
  if (!slug) {
    throw new CliError(
      `Could not make a slug from "${name}"; give --slug.`,
      EXIT_USAGE,
    );
  }
  for (;;) {
    try {
      const { agentToken, printer: created } = await enroll(
        serverUrl,
        enrollToken,
        {
          name,
          queue: printer.uri,
          slug,
        },
      );
      return { ...created, agentToken };
    } catch (error) {
      if (!(
        prompts &&
        error instanceof ServerError &&
        error.status === 409
      )) {
        throw error;
      }
      slug = await prompts.promptSlug(
        name,
        `"${slug}" is taken; choose another slug`,
      );
    }
  }
}

/** An environment variable, validated like the matching flag. */
function fromEnv(
  env: Env,
  key: string,
  parse: (value: string) => string,
): string | undefined {
  const value = env[key]?.trim();
  if (!value) {
    return undefined;
  }
  try {
    return parse(value);
  } catch (error) {
    throw new CliError(
      `${key} ${error instanceof Error ? error.message : String(error)}.`,
      EXIT_USAGE,
    );
  }
}

async function main(
  context: LocalContext,
  flags: InstallFlags,
): Promise<void> {
  const { env, stderr, stdout } = context.process;
  const say = (line: string) => stdout.write(`${line}\n`);
  if (!satisfiesMinimum(context.process.version)) {
    throw new CliError(
      `Node.js ${MIN_NODE_VERSION} or newer is required (this is ${context.process.version}).`,
    );
  }
  if (flags.printEnrollToken && flags.printAgentToken) {
    throw new CliError(
      'Give --print-enroll-token (new printer) or --print-agent-token (existing printer), not both.',
      EXIT_USAGE,
    );
  }
  const interactive = isInteractive(context);
  const uid = context.process.getuid?.() ?? -1;
  const scope = serviceScope(uid);
  const candidates = configCandidates(env, homedir());

  const target =
    flags.config ??
    (await firstWritable(
      defaultWriteTarget(uid, candidates),
      candidates,
    ));
  if (!target) {
    throw new CliError(
      `None of these config locations is writable; choose one with --config:\n${candidates.map((c) => `  ${c}`).join('\n')}`,
      EXIT_USAGE,
    );
  }
  if (!flags.force && (await configExists(target))) {
    throw new CliError(
      `${target} already exists. Start the agent with \`uwacwy-print-agent run\`, or replace it with --force.`,
      EXIT_USAGE,
    );
  }

  let serverUrl =
    flags.printServerUrl ??
    fromEnv(env, 'PRINT_SERVER_URL', parseServerUrl);
  let agentToken =
    flags.printAgentToken ??
    (flags.printEnrollToken
      ? undefined
      : fromEnv(env, 'PRINT_AGENT_TOKEN', parseAgentToken));
  let enrollToken =
    flags.printEnrollToken ??
    (agentToken
      ? undefined
      : fromEnv(env, 'PRINT_ENROLL_TOKEN', parseEnrollToken));
  const printerUri =
    flags.printerUri ??
    fromEnv(env, 'PRINTER_URI', parsePrinterUri);

  if (!interactive) {
    const missing = [
      ...(serverUrl ? [] : ['PRINT_SERVER_URL']),
      ...(agentToken || enrollToken
        ? []
        : ['PRINT_ENROLL_TOKEN']),
      ...(printerUri ? [] : ['PRINTER_URI']),
    ];
    if (missing.length) {
      const printers = printerUri
        ? undefined
        : formatDiscovery(
            await discover(['cups', 'ipp'], {
              mdnsTimeoutMs: 3000,
            }),
          );
      throw new CliError(
        missingSettingsMessage(missing, candidates, printers),
        EXIT_USAGE,
      );
    }
  }
  const prompts: Prompts | undefined = interactive
    ? await import('../../prompts/prompts')
    : undefined;

  serverUrl ??= await prompts!.promptServerUrl();
  if (
    !isAllowedServerUrl(serverUrl, { insecure: flags.insecure })
  ) {
    throw new CliError(
      `${serverUrl} must use https:// (plain http:// is allowed only on localhost, or with --insecure).`,
      EXIT_USAGE,
    );
  }
  if (!agentToken) {
    enrollToken ??= await prompts!.promptEnrollToken();
  }

  const printer = await resolvePrinter(printerUri, prompts);

  if (enrollToken) {
    const created = await enrollPrinter(
      serverUrl,
      enrollToken,
      printer,
      flags,
      prompts,
    );
    agentToken = created.agentToken;
    say(
      `Enrolled "${created.name}" as ${serverUrl}/print/${created.slug}.`,
    );
  } else {
    const reported = await reportQueue(
      serverUrl,
      agentToken!,
      printer.uri,
    );
    say(`Connected to "${reported.name}" (${reported.slug}).`);
  }
  const config: AgentConfig = {
    PRINT_AGENT_TOKEN: agentToken!,
    PRINT_SERVER_URL: serverUrl,
    PRINTER_URI: printer.uri,
  };

  const hostWide = scope === 'system' && flags.service;
  try {
    const service = hostWide
      ? await import('./service')
      : undefined;
    const gid = service
      ? await service.ensureServiceUser()
      : undefined;
    await writeConfig(target, config, {
      gid,
      mode: hostWide ? 0o640 : 0o600,
    });
  } catch (error) {
    if (enrollToken) {
      stderr.write(
        `The printer was enrolled but its settings could not be saved. Keep this agent token:\n  ${agentToken}\n`,
      );
    }
    throw error;
  }
  say(`Saved settings to ${target}.`);

  if (flags.service) {
    const { installService } = await import('./service');
    await installService({
      configPath: target,
      insecure: flags.insecure,
      log: say,
      scope,
    });
  } else {
    say(
      `Start the agent with: uwacwy-print-agent run --config ${target}${flags.insecure ? ' --insecure' : ''}`,
    );
  }
}

/** The flag/env printer (checked against CUPS), or one chosen at the prompt. */
async function resolvePrinter(
  uri: string | undefined,
  prompts: Prompts | undefined,
): Promise<DiscoveredPrinter> {
  if (!uri) {
    return prompts!.choosePrinter();
  }
  const queue = cupsQueueName(uri);
  if (!queue) {
    return { name: defaultPrinterName(uri, []), uri };
  }
  const discoveries = await discover(['cups']);
  const problem = missingQueueProblem(queue, discoveries);
  if (problem?.missing) {
    throw new CliError(problem.message, EXIT_USAGE);
  }
  return {
    name: defaultPrinterName(
      uri,
      discoveries.flatMap((discovery) => discovery.printers),
    ),
    uri,
  };
}

const defaultName = (name: string): string => {
  try {
    return parseName(name);
  } catch (error) {
    throw new CliError(
      `The printer's name "${name}" ${error instanceof Error ? error.message : String(error)}; give --name.`,
      EXIT_USAGE,
    );
  }
};
