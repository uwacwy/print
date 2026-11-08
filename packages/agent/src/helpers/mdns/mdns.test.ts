import { describe, expect, it } from 'vitest';
import { serviceToPrinter } from './mdns';

describe('serviceToPrinter', () => {
  it('builds an IPP Everywhere URI from the DNS-SD record', () => {
    expect(
      serviceToPrinter({
        name: 'HP LaserJet MFP M130fw (D8F5EC)',
        type: 'ipp',
        host: 'NPID8F5EC.local.',
        port: 631,
        txt: {
          rp: 'ipp/print',
          ty: 'HP LaserJet MFP M129-M134',
          note: Buffer.from('Front desk'),
        },
      }),
    ).toEqual({
      uri: 'ipp://NPID8F5EC.local:631/ipp/print',
      name: 'HP LaserJet MFP M130fw (D8F5EC)',
      detail:
        'HP LaserJet MFP M129-M134 · Front desk · NPID8F5EC.local',
    });
  });

  it('defaults the resource path and keeps ipps', () => {
    expect(
      serviceToPrinter({
        name: '',
        type: 'ipps',
        host: 'p.local',
        port: 443,
      }),
    ).toEqual({
      uri: 'ipps://p.local:443/ipp/print',
      name: 'p.local',
      detail: 'p.local',
    });
  });

  it('ignores other services', () => {
    expect(
      serviceToPrinter({
        name: 'x',
        type: 'http',
        host: 'p.local',
        port: 80,
      }),
    ).toBeUndefined();
  });
});
