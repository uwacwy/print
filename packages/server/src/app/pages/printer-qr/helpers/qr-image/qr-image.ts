import { toString as qrSvg } from 'qrcode';

/** A data URI for an SVG QR code of `url`, usable as an image `src`. */
export const qrDataUri = (url: string): Promise<string> =>
  qrSvg(url, { type: 'svg', margin: 2 }).then(
    (svg) =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
