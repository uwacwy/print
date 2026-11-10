import { buildCommand } from '@stricli/core';

import type { LocalContext } from '../../context';

export interface RunFlags {
  readonly config?: string;
  readonly insecure?: boolean;
}

export const runCommand = buildCommand<
  RunFlags,
  [],
  LocalContext
>({
  docs: {
    brief: 'Connect to the print server and print its jobs',
    fullDescription: [
      'Settings: PRINT_SERVER_URL, PRINT_AGENT_TOKEN, and PRINTER_URI.',
      'Environment variables win; a config file fills the gaps. Without --config the first of',
      '~/.config/uwacwy-print-agent.env, /usr/local/etc/uwacwy-print-agent.env, and',
      '/etc/uwacwy-print-agent.env is used. At a terminal, missing settings are prompted for',
      'and saved so the next run needs no prompts.',
    ].join('\n'),
  },
  loader: () => import('./impl'),
  parameters: {
    flags: {
      config: {
        brief: 'Config file to use instead of searching for one',
        kind: 'parsed',
        optional: true,
        parse: String,
        placeholder: 'path',
      },
      insecure: {
        brief:
          'Allow a plain http:// print server that is not on localhost',
        kind: 'boolean',
        optional: true,
      },
    },
  },
});
