import type { RequestHandler, Response } from 'express';
import { getPrinterBySlug, type PrintDatabase, type PrinterRow } from '../lib/database/database.js';
import {
  verifyUploadToken,
  type UploadTokenKey,
  type UploadTokenSource,
  type UploadTokenVerification,
} from '../lib/upload-token/upload-token.js';
import { bearerToken } from '../realtime/agent-gateway';

export type UploadTokenStatus = UploadTokenVerification['status'];

export interface UploadAccess {
  printer: PrinterRow;
  source: UploadTokenSource;
  notBefore: Date;
  expiresAt: Date;
}

const ACCESS_LOCAL = 'uploadAccess';

const DENIED: Record<Exclude<UploadTokenStatus, 'valid'> | 'missing', { code: string; error: string }> = {
  missing: {
    code: 'token_required',
    error: "Scan the printer's QR code or enter its PIN to print.",
  },
  invalid: {
    code: 'token_invalid',
    error: 'This print link is not valid. Scan the QR code again or enter the PIN.',
  },
  expired: {
    code: 'token_expired',
    error: 'This print link has expired. Scan the QR code again or enter the PIN.',
  },
  'not-yet-valid': {
    code: 'token_not_yet_valid',
    error: 'This QR code is not active yet.',
  },
};

/** Status of the request's Bearer upload token for this printer, or null when none was sent. */
export async function uploadTokenStatus(
  key: UploadTokenKey,
  printer: PrinterRow,
  authorization: string | undefined,
): Promise<UploadTokenVerification | null> {
  const token = bearerToken(authorization);
  return token ? verifyUploadToken(key, printer, token) : null;
}

/**
 * Rejects uploads without a valid Bearer upload token before the multipart body is read,
 * so unauthorized clients cannot make the server buffer large files.
 */
export function requireUploadToken(db: PrintDatabase, key: UploadTokenKey): RequestHandler {
  return async (request, response, next) => {
    const printer = getPrinterBySlug(db, String(request.params['slug']));
    if (!printer) {
      response.status(404).json({ error: 'Printer not found.' });
      return;
    }
    const verification = await uploadTokenStatus(key, printer, request.headers.authorization);
    if (verification?.status !== 'valid') {
      response
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="print-upload"')
        .json(DENIED[verification?.status ?? 'missing']);
      return;
    }
    response.locals[ACCESS_LOCAL] = {
      printer,
      source: verification.source,
      notBefore: verification.notBefore,
      expiresAt: verification.expiresAt,
    } satisfies UploadAccess;
    next();
  };
}

export function uploadAccess(response: Response): UploadAccess {
  const access = response.locals[ACCESS_LOCAL] as UploadAccess | undefined;
  if (!access) throw new Error('requireUploadToken must run before this handler.');
  return access;
}
