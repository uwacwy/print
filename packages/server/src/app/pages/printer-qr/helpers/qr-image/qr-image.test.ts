import { describe, expect, it } from 'vitest';

import { qrDataUri } from './qr-image';

describe('qrDataUri', () => {
  it('encodes an SVG QR code as a data URI', async () => {
    const uri = await qrDataUri(
      'https://print.example.org/print/front',
    );
    expect(uri).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(uri.split(',')[1])).toContain(
      '<svg',
    );
  });
});
