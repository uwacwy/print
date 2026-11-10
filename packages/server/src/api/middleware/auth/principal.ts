import type { Request, Response } from 'express';

import type { PrinterRow } from '../../helpers/database/database';
import type { UploadTokenSource } from './upload-token/upload-token';

/**
 * Why a strategy declined. `presented` is true when the request carried this strategy's kind
 * of credential, so its failure explains the rejection better than "nothing was sent".
 */
export interface AuthChallenge {
  code: string;
  details?: Record<string, unknown>;
  error: string;
  presented: boolean;
  /** WWW-Authenticate challenge for 401 responses. */
  scheme?: string;
  status: 401 | 403 | 503;
}

/** Who a request was authenticated as; set on `req.user` by `authenticate()`. */
export type Principal =
  | { expiresAt: Date; kind: 'enroll' }
  | {
      expiresAt: Date;
      kind: 'uploadToken';
      notBefore: Date;
      printer: PrinterRow;
      source: UploadTokenSource;
    }
  | { id: string; kind: 'entraUser'; roles: string[] }
  | { kind: 'agent'; printer: PrinterRow }
  | { kind: 'pin'; printer: PrinterRow };

export const isAuthChallenge = (
  value: unknown,
): value is AuthChallenge =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  'presented' in value;

export function optionalPrincipal(
  request: Request,
): Principal | undefined {
  return request.user as Principal | undefined;
}

export function principal(request: Request): Principal {
  if (!request.user) {
    throw new Error(
      'authenticate() must run before this handler.',
    );
  }
  return request.user as Principal;
}

/** The printer loaded for the `:slug` route parameter, if any. */
export const routePrinter = (
  response: Response | undefined,
): PrinterRow | undefined =>
  response?.locals['printer'] as PrinterRow | undefined;

/** Records which credential submitted a job. */
export function submittedBy(who: Principal): string {
  switch (who.kind) {
    case 'agent':
      return 'agent';
    case 'enroll':
      return 'enroll';
    case 'entraUser':
      return `entra:${who.id}`;
    case 'pin':
      return 'pin';
    case 'uploadToken':
      return `${who.source}:${who.notBefore.toISOString()}/${who.expiresAt.toISOString()}`;
  }
}
