import { describe, expect, it } from 'vitest';

import { serviceToPrinter } from './mdns';

describe('serviceToPrinter', () => {
  it('builds an IPP Everywhere URI from the DNS-SD record', () => {
    expect(
      serviceToPrinter({
        host: 'NPID8F5EC.local.',
        name: 'HP LaserJet MFP M130fw (D8F5EC)',
        port: 631,
        txt: {
          note: Buffer.from('Front desk'),
          rp: 'ipp/print',
          ty: 'HP LaserJet MFP M129-M134',
        },
        type: 'ipp',
      }),
    ).toEqual({
      detail:
        'HP LaserJet MFP M129-M134 · Front desk · NPID8F5EC.local',
      name: 'HP LaserJet MFP M130fw (D8F5EC)',
      uri: 'ipp://NPID8F5EC.local:631/ipp/print',
    });
  });

  it('defaults the resource path and keeps ipps', () => {
    expect(
      serviceToPrinter({
        host: 'p.local',
        name: '',
        port: 443,
        type: 'ipps',
      }),
    ).toEqual({
      detail: 'p.local',
      name: 'p.local',
      uri: 'ipps://p.local:443/ipp/print',
    });
  });

  it('ignores other services', () => {
    expect(
      serviceToPrinter({
        host: 'p.local',
        name: 'x',
        port: 80,
        type: 'http',
      }),
    ).toBeUndefined();
  });
});
