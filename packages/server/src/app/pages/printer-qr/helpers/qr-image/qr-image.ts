import { toString as qrSvg } from 'qrcode';

/** A data URI for an SVG QR code of `url`, usable as an image `src`. */
export const qrDataUri = (url: string): Promise<string> =>
  qrSvg(url, { margin: 2, type: 'svg' }).then(
    (svg) =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
