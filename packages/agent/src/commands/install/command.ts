import { buildCommand } from '@stricli/core';

import type { LocalContext } from '../../context';

import {
  parseAgentToken,
  parseEnrollToken,
  parseName,
  parsePrinterUri,
  parseServerUrl,
  parseSlug,
} from '../../helpers/flag-parsers/flag-parsers';

export interface InstallFlags {
  readonly config?: string;
  readonly force: boolean;
  readonly insecure?: boolean;
  readonly name?: string;
  readonly printAgentToken?: string;
  readonly printEnrollToken?: string;
  readonly printerUri?: string;
  readonly printServerUrl?: string;
  readonly service: boolean;
  readonly slug?: string;
}

export const installCommand = buildCommand<
  InstallFlags,
  [],
  LocalContext
>({
  docs: {
    brief:
      "Set up this computer as a printer's agent and start it",
    customUsage: [
      '--print-server-url url --print-enroll-token token',
      '--print-server-url url --print-agent-token token --printer-uri uri',
    ],
    fullDescription: [
      'With --print-enroll-token, enrolls a new printer: pick CUPS or IPP, choose a printer, and',
      'confirm its name and slug. With --print-agent-token, sets up a printer already added on',
      'the server. Either way the settings are saved to a config file and, unless --no-service,',
      'a systemd service is installed (a system service as root, else a user service).',
      'Values not given as flags come from PRINT_SERVER_URL, PRINT_ENROLL_TOKEN,',
      'PRINT_AGENT_TOKEN, and PRINTER_URI, or are prompted for at a terminal.',
    ].join('\n'),
  },
  loader: () => import('./impl'),
  parameters: {
    flags: {
      config: {
        brief:
          'Config file to write (default: ~/.config, or /etc as root)',
        kind: 'parsed',
        optional: true,
        parse: String,
        placeholder: 'path',
      },
      force: {
        brief: 'Replace an existing config file and service',
        default: false,
        kind: 'boolean',
      },
      insecure: {
        brief:
          'Allow a plain http:// print server that is not on localhost',
        kind: 'boolean',
        optional: true,
      },
      name: {
        brief:
          "Printer name when enrolling (default: the printer's own name)",
        kind: 'parsed',
        optional: true,
        parse: parseName,
        placeholder: 'name',
      },
      printAgentToken: {
        brief:
          'Agent token of a printer already added on the server',
        kind: 'parsed',
        optional: true,
        parse: parseAgentToken,
        placeholder: 'token',
      },
      printEnrollToken: {
        brief:
          'Short-lived token from "Add printer"; enrolls a new printer',
        kind: 'parsed',
        optional: true,
        parse: parseEnrollToken,
        placeholder: 'token',
      },
      printerUri: {
        brief:
          'cups://<queue> or ipp://<host>/<path> (prompted when omitted)',
        kind: 'parsed',
        optional: true,
        parse: parsePrinterUri,
        placeholder: 'uri',
      },
      printServerUrl: {
        brief:
          'Print server address, e.g. https://print.contoso.com',
        kind: 'parsed',
        optional: true,
        parse: parseServerUrl,
        placeholder: 'url',
      },
      service: {
        brief: 'Install and start a systemd service',
        default: true,
        kind: 'boolean',
      },
      slug: {
        brief:
          'Printer slug when enrolling (default: from the name)',
        kind: 'parsed',
        optional: true,
        parse: parseSlug,
        placeholder: 'slug',
      },
    },
  },
});
