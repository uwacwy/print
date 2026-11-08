import {
  buildApplication,
  buildRouteMap,
  type Application,
} from '@stricli/core';
import {
  buildInstallCommand,
  buildUninstallCommand,
} from '@stricli/auto-complete';
import type { LocalContext } from './context';
import { exitCodeFor } from './helpers/cli-error/cli-error';
import { installCommand } from './commands/install/command';
import { listQueuesCommand } from './commands/list-queues/command';
import { runCommand } from './commands/run/command';
import { AGENT_VERSION } from './version';

export const CLI_NAME = 'uwacwy-print-agent';
/** Hidden command bash completion calls; index.ts answers it before Stricli runs. */
export const COMPLETE_COMMAND = '__complete';

const completion = buildRouteMap({
  routes: {
    install: buildInstallCommand<LocalContext>(CLI_NAME, {
      bash: `${CLI_NAME} ${COMPLETE_COMMAND}`,
    }),
    uninstall: buildUninstallCommand<LocalContext>(CLI_NAME, {
      bash: true,
    }),
  },
  docs: { brief: 'Install or remove bash completion' },
});

const root = buildRouteMap({
  routes: {
    run: runCommand,
    install: installCommand,
    listQueues: listQueuesCommand,
    completion,
  },
  docs: {
    brief:
      "United Way Quick Print agent: prints a print server's jobs through CUPS or IPP",
  },
});

export const app: Application<LocalContext> = buildApplication(
  root,
  {
    name: CLI_NAME,
    versionInfo: { currentVersion: AGENT_VERSION },
    scanner: { caseStyle: 'allow-kebab-for-camel' },
    documentation: { caseStyle: 'convert-camel-to-kebab' },
    determineExitCode: exitCodeFor,
  },
);
