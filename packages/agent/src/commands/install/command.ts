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
  readonly printServerUrl?: string;
  readonly printEnrollToken?: string;
  readonly printAgentToken?: string;
  readonly printerUri?: string;
  readonly name?: string;
  readonly slug?: string;
  readonly config?: string;
  readonly force: boolean;
  readonly service: boolean;
  readonly insecure?: boolean;
}

export const installCommand = buildCommand<
  InstallFlags,
  [],
  LocalContext
>({
  loader: () => import('./impl'),
  parameters: {
    flags: {
      printServerUrl: {
        kind: 'parsed',
        parse: parseServerUrl,
        brief:
          'Print server address, e.g. https://print.example.org',
        placeholder: 'url',
        optional: true,
      },
      printEnrollToken: {
        kind: 'parsed',
        parse: parseEnrollToken,
        brief:
          'Short-lived token from "Add printer"; enrolls a new printer',
        placeholder: 'token',
        optional: true,
      },
      printAgentToken: {
        kind: 'parsed',
        parse: parseAgentToken,
        brief:
          'Agent token of a printer already added on the server',
        placeholder: 'token',
        optional: true,
      },
      printerUri: {
        kind: 'parsed',
        parse: parsePrinterUri,
        brief:
          'cups://<queue> or ipp://<host>/<path> (prompted when omitted)',
        placeholder: 'uri',
        optional: true,
      },
      name: {
        kind: 'parsed',
        parse: parseName,
        brief:
          "Printer name when enrolling (default: the printer's own name)",
        placeholder: 'name',
        optional: true,
      },
      slug: {
        kind: 'parsed',
        parse: parseSlug,
        brief:
          'Printer slug when enrolling (default: from the name)',
        placeholder: 'slug',
        optional: true,
      },
      config: {
        kind: 'parsed',
        parse: String,
        brief:
          'Config file to write (default: ~/.config, or /etc as root)',
        placeholder: 'path',
        optional: true,
      },
      force: {
        kind: 'boolean',
        brief: 'Replace an existing config file and service',
        default: false,
      },
      service: {
        kind: 'boolean',
        brief: 'Install and start a systemd service',
        default: true,
      },
      insecure: {
        kind: 'boolean',
        brief:
          'Allow a plain http:// print server that is not on localhost',
        optional: true,
      },
    },
  },
  docs: {
    brief: "Set up this computer as a printer's agent and start it",
    fullDescription: [
      'With --print-enroll-token, enrolls a new printer: pick CUPS or IPP, choose a printer, and',
      'confirm its name and slug. With --print-agent-token, sets up a printer already added on',
      'the server. Either way the settings are saved to a config file and, unless --no-service,',
      'a systemd service is installed (a system service as root, else a user service).',
      'Values not given as flags come from PRINT_SERVER_URL, PRINT_ENROLL_TOKEN,',
      'PRINT_AGENT_TOKEN, and PRINTER_URI, or are prompted for at a terminal.',
    ].join('\n'),
    customUsage: [
      '--print-server-url url --print-enroll-token token',
      '--print-server-url url --print-agent-token token --printer-uri uri',
    ],
  },
});
