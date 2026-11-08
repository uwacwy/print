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
  loader: () => import('./impl'),
  parameters: {
    flags: {
      cups: {
        kind: 'boolean',
        brief: 'List CUPS queues (lpstat)',
        optional: true,
      },
      ipp: {
        kind: 'boolean',
        brief: 'Browse the network for IPP printers (mDNS)',
        optional: true,
      },
      json: {
        kind: 'boolean',
        brief: 'Print JSON instead of text',
        optional: true,
      },
      timeout: {
        kind: 'parsed',
        parse: numberParser,
        brief: 'Seconds to browse for IPP printers',
        placeholder: 'seconds',
        default: '4',
      },
    },
  },
  docs: {
    brief:
      'List printers this computer can use, as PRINTER_URI values',
    fullDescription:
      'Lists CUPS queues and IPP printers found on the network (both unless --cups or --ipp is given).',
  },
});
