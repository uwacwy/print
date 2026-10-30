import type { SocketAuthError } from '@uwacwy/print-shared';
import type { Socket } from 'socket.io';
import type {
  Authenticate,
  StrategyName,
} from '../../middleware/auth/passport/passport';
import {
  isAuthChallenge,
  type Principal,
} from '../../middleware/auth/principal';

/** Per-socket state set during the handshake. */
export interface SocketData {
  principal: Principal;
}

/**
 * Namespace middleware that authenticates `auth.token` from the client's handshake with the
 * same Passport strategies the HTTP routes use. Rejections reach the client as `connect_error`.
 */
export const handshake =
  (verify: Authenticate['verify'], ...strategies: StrategyName[]) =>
  (
    socket: Pick<Socket, 'handshake'> & {
      data: Partial<SocketData>;
    },
    next: (error?: Error) => void,
  ) => {
    const token: unknown = socket.handshake.auth['token'];
    verify(
      typeof token === 'string' ? `Bearer ${token}` : undefined,
      ...strategies,
    ).then(
      (result) => {
        if (isAuthChallenge(result)) {
          const data: SocketAuthError = {
            code: result.code,
            status: result.status,
          };
          return next(
            Object.assign(new Error(result.error), { data }),
          );
        }
        socket.data.principal = result;
        next();
      },
      () => next(new Error('Authentication failed')),
    );
  };
