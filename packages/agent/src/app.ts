import {
  buildInstallCommand,
  buildUninstallCommand,
} from '@stricli/auto-complete';
import {
  type Application,
  buildApplication,
  buildRouteMap,
} from '@stricli/core';

import type { LocalContext } from './context';

import { installCommand } from './commands/install/command';
import { listQueuesCommand } from './commands/list-queues/command';
import { runCommand } from './commands/run/command';
import { exitCodeFor } from './helpers/cli-error/cli-error';
import { AGENT_VERSION } from './version';

export const CLI_NAME = 'uwacwy-print-agent';
/** Hidden command bash completion calls; index.ts answers it before Stricli runs. */
export const COMPLETE_COMMAND = '__complete';

const completion = buildRouteMap({
  docs: { brief: 'Install or remove bash completion' },
  routes: {
    install: buildInstallCommand<LocalContext>(CLI_NAME, {
      bash: `${CLI_NAME} ${COMPLETE_COMMAND}`,
    }),
    uninstall: buildUninstallCommand<LocalContext>(CLI_NAME, {
      bash: true,
    }),
  },
});

const root = buildRouteMap({
  docs: {
    brief:
      "United Way Quick Print agent: prints a print server's jobs through CUPS or IPP",
  },
  routes: {
    completion,
    install: installCommand,
    listQueues: listQueuesCommand,
    run: runCommand,
  },
});

export const app: Application<LocalContext> = buildApplication(
  root,
  {
    determineExitCode: exitCodeFor,
    documentation: { caseStyle: 'convert-camel-to-kebab' },
    name: CLI_NAME,
    scanner: { caseStyle: 'allow-kebab-for-camel' },
    versionInfo: { currentVersion: AGENT_VERSION },
  },
);
