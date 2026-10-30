import type { Request, Response } from 'express';
import type { PrinterRow } from '../../../lib/database/database.js';
import type { UploadTokenSource } from '../../../lib/upload-token/upload-token.js';

/** Who a request was authenticated as; set on `req.user` by `authenticate()`. */
export type Principal =
  | { kind: 'entraUser'; id: string; roles: string[] }
  | {
      kind: 'uploadToken';
      printer: PrinterRow;
      source: UploadTokenSource;
      notBefore: Date;
      expiresAt: Date;
    }
  | { kind: 'pin'; printer: PrinterRow }
  | { kind: 'agent'; printer: PrinterRow };

/**
 * Why a strategy declined. `presented` is true when the request carried this strategy's kind
 * of credential, so its failure explains the rejection better than "nothing was sent".
 */
export interface AuthChallenge {
  code: string;
  error: string;
  status: 401 | 403 | 503;
  presented: boolean;
  /** WWW-Authenticate challenge for 401 responses. */
  scheme?: string;
  details?: Record<string, unknown>;
}

export const isAuthChallenge = (
  value: unknown,
): value is AuthChallenge =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  'presented' in value;

export function principal(request: Request): Principal {
  if (!request.user) {
    throw new Error('authenticate() must run before this handler.');
  }
  return request.user as Principal;
}

export function optionalPrincipal(
  request: Request,
): Principal | undefined {
  return request.user as Principal | undefined;
}

/** The printer loaded for the `:slug` route parameter, if any. */
export const routePrinter = (
  response: Response | undefined,
): PrinterRow | undefined =>
  response?.locals['printer'] as PrinterRow | undefined;

/** Records which credential submitted a job. */
export function submittedBy(who: Principal): string {
  switch (who.kind) {
    case 'entraUser':
      return `entra:${who.id}`;
    case 'uploadToken':
      return `${who.source}:${who.notBefore.toISOString()}/${who.expiresAt.toISOString()}`;
    case 'pin':
      return 'pin';
    case 'agent':
      return 'agent';
  }
}
