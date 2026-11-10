import { buildCommand, numberParser } from '@stricli/core';

import type { LocalContext } from '../../context';

export interface ListQueuesFlags {
  readonly cups?: boolean;
  readonly ipp?: boolean;
  readonly json?: boolean;
  readonly timeout: number;
}

export const listQueuesCommand = buildCommand<
  ListQueuesFlags,
  [],
  LocalContext
>({
  docs: {
    brief:
      'List printers this computer can use, as PRINTER_URI values',
    fullDescription:
      'Lists CUPS queues and IPP printers found on the network (both unless --cups or --ipp is given).',
  },
  loader: () => import('./impl'),
  parameters: {
    flags: {
      cups: {
        brief: 'List CUPS queues (lpstat)',
        kind: 'boolean',
        optional: true,
      },
      ipp: {
        brief: 'Browse the network for IPP printers (mDNS)',
        kind: 'boolean',
        optional: true,
      },
      json: {
        brief: 'Print JSON instead of text',
        kind: 'boolean',
        optional: true,
      },
      timeout: {
        brief: 'Seconds to browse for IPP printers',
        default: '4',
        kind: 'parsed',
        parse: numberParser,
        placeholder: 'seconds',
      },
    },
  },
});
