import { describe, expect, it } from 'vitest';
import {
  cupsPrinters,
  cupsQueueName,
  defaultPrinterName,
  formatDiscovery,
  missingQueueProblem,
} from './discovery';

describe('discovery', () => {
  it('names CUPS queues from their descriptions', () => {
    expect(
      cupsPrinters(
        ['HP-LaserJet-MFP-M129-M134', 'Front_Desk'],
        new Map([
          ['HP-LaserJet-MFP-M129-M134', 'HP LaserJet MFP M130fw'],
        ]),
      ),
    ).toEqual([
      {
        uri: 'cups://HP-LaserJet-MFP-M129-M134',
        name: 'HP LaserJet MFP M130fw',
        detail: 'HP-LaserJet-MFP-M129-M134',
      },
      {
        uri: 'cups://Front_Desk',
        name: 'Front Desk',
        detail: 'Front_Desk',
      },
    ]);
  });

  it('formats printers and failures for the terminal', () => {
    expect(
      formatDiscovery([
        {
          kind: 'cups',
          printers: [
            { uri: 'cups://Front_Desk', name: 'Front Desk' },
          ],
        },
        { kind: 'ipp', printers: [], error: 'Could not browse.' },
      ]),
    ).toBe(
      [
        'CUPS queues:',
        '  cups://Front_Desk  (Front Desk)',
        'IPP printers on the network:',
        '  Could not browse.',
      ].join('\n'),
    );
    expect(formatDiscovery([{ kind: 'ipp', printers: [] }])).toBe(
      'IPP printers on the network:\n  (none found)',
    );
  });

  it('extracts the CUPS queue from a printer URI', () => {
    expect(
      cupsQueueName('cups://Front_Desk?option_sides=one-sided'),
    ).toBe('Front_Desk');
    expect(cupsQueueName('ipp://p.local/ipp/print')).toBeUndefined();
    expect(cupsQueueName('nope')).toBeUndefined();
  });

  it('explains a missing CUPS queue with the available ones', () => {
    const found = [
      {
        kind: 'cups' as const,
        printers: [{ uri: 'cups://Front_Desk', name: 'Front Desk' }],
      },
    ];
    expect(missingQueueProblem('Front_Desk', found)).toBeUndefined();
    expect(missingQueueProblem('Back', found)).toEqual({
      message:
        'CUPS has no queue named Back.\nCUPS queues:\n  cups://Front_Desk  (Front Desk)',
      missing: true,
    });
    expect(
      missingQueueProblem('Back', [
        { kind: 'cups', printers: [], error: 'lpstat missing' },
      ]),
    ).toEqual({ message: 'lpstat missing', missing: false });
  });
});

describe('defaultPrinterName', () => {
  const printers = [{ uri: 'cups://Office', name: 'Office Laser' }];

  it('prefers the discovered name', () => {
    expect(defaultPrinterName('cups://Office', printers)).toBe(
      'Office Laser',
    );
  });

  it('falls back to the queue, spaced out', () => {
    expect(defaultPrinterName('cups://HP_LaserJet-M130', [])).toBe(
      'HP LaserJet M130',
    );
  });

  it('falls back to the IPP host', () => {
    expect(
      defaultPrinterName('ipp://printer.local/ipp/print', []),
    ).toBe('printer.local');
  });
});
