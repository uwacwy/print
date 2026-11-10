import { z } from 'zod';

export const IssuedUploadToken = z.object({
  expiresAt: z.string(),
  token: z.string(),
});
export type IssuedUploadToken = z.infer<
  typeof IssuedUploadToken
>;

export const IssuedQrToken = IssuedUploadToken.extend({
  notBefore: z.string(),
  /** Relative print-page link including the token. */
  path: z.string(),
  url: z.string(),
});
export type IssuedQrToken = z.infer<typeof IssuedQrToken>;

const isoDateTime = z.iso.datetime({ offset: true });

export const UploadTokenWindow = z.object({
  expiresAt: isoDateTime.optional(),
  notBefore: isoDateTime.optional(),
});
export type UploadTokenWindow = z.infer<
  typeof UploadTokenWindow
>;

/** Either reuse an issued token or request a new one for the given window. */
export const QrPosterRequest = UploadTokenWindow.extend({
  token: z.string().min(1).optional(),
});
export type QrPosterRequest = z.infer<typeof QrPosterRequest>;
