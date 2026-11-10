import type { NextFunction, Request, Response } from 'express';

import { Passport } from 'passport';

import type { PrintDatabase } from '../../../helpers/database/database';
import type { EnrollTokenKey } from '../../../helpers/enroll-token/enroll-token';
import type { UploadTokenKey } from '../upload-token/upload-token';

import { AgentTokenStrategy } from '../agent-token/agent-token.strategy';
import { EnrollTokenStrategy } from '../enroll-token/enroll-token.strategy';
import {
  createEntraUserStrategy,
  type EntraUserOptions,
} from '../entra-user/entra-user.strategy';
import { PinStrategy } from '../pin/pin.strategy';
import {
  type AuthChallenge,
  isAuthChallenge,
  type Principal,
} from '../principal';
import { UploadTokenStrategy } from '../upload-token/upload-token.strategy';

export interface Authenticate {
  /** Accepts the first strategy that succeeds, in order; otherwise responds 401/403/503. */
  (...strategies: StrategyName[]): AuthMiddleware;
  /** Like `authenticate`, but continues anonymously when every strategy declines. */
  optional(...strategies: StrategyName[]): AuthMiddleware;
  /** Checks an `Authorization` value outside HTTP routing, e.g. a socket handshake. */
  verify: (
    authorization: string | undefined,
    ...strategies: StrategyName[]
  ) => Promise<AuthChallenge | Principal>;
}

/** Deliberately not generic: a generic middleware makes TypeScript infer `any` for the typed `validate` that follows it. */
export type AuthMiddleware = (
  request: Request,
  response: Response,
  next: NextFunction,
) => void;

export interface AuthOptions {
  db: PrintDatabase;
  /** Registers `enrollToken`. */
  enrollToken?: EnrollTokenKey;
  /** Registers `entraUser` (unconfigured tenants answer 503 to presented JWTs). */
  entra?: EntraUserOptions;
  /** Registers `uploadToken`. */
  uploadToken?: UploadTokenKey;
}

export type StrategyName =
  | 'agentToken'
  | 'enrollToken'
  | 'entraUser'
  | 'pin'
  | 'uploadToken';

// @types/passport returns `any`; with a callback the result is always a request handler.
type Authenticator = (
  strategies: StrategyName[],
  options: { session: false },
  callback: (
    error: unknown,
    user: Express.User | false,
    info: unknown,
  ) => void,
) => (
  request: Request<unknown>,
  response: Response,
  next: NextFunction,
) => void;

const UNKNOWN: AuthChallenge = {
  code: 'unauthorized',
  error: 'Unauthorized',
  presented: false,
  status: 401,
};

/** Builds an isolated Passport instance and its per-route `authenticate(...)` middleware. */
export function createAuthenticate({
  db,
  enrollToken,
  entra,
  uploadToken,
}: AuthOptions): Authenticate {
  const passport = new Passport();
  passport.use('agentToken', new AgentTokenStrategy(db));
  passport.use('pin', new PinStrategy());
  if (entra) {
    passport.use('entraUser', createEntraUserStrategy(entra));
  }
  if (uploadToken) {
    passport.use(
      'uploadToken',
      new UploadTokenStrategy(uploadToken),
    );
  }

  if (enrollToken) {
    passport.use(
      'enrollToken',
      new EnrollTokenStrategy(enrollToken),
    );
  }

  const middleware =
    (optional: boolean) =>
    (...strategies: StrategyName[]): AuthMiddleware =>
    (request, response, next) =>
      (passport.authenticate as Authenticator)(
        strategies,
        { session: false },
        (
          error: unknown,
          user: Express.User | false,
          info: unknown,
        ) => {
          if (error) {
            return next(error);
          }
          if (user) {
            request.user = user;
            return next();
          }
          if (optional) {
            return next();
          }
          const challenges = (
            Array.isArray(info) ? info : [info]
          ).filter(isAuthChallenge);
          const challenge = selectChallenge(challenges);
          const schemes = new Set(
            [challenge, ...challenges].flatMap((each) =>
              each.scheme ? [each.scheme] : [],
            ),
          );
          if (challenge.status === 401 && schemes.size) {
            response.set(
              'WWW-Authenticate',
              [...schemes].join(', '),
            );
          }
          response.status(challenge.status).json({
            code: challenge.code,
            error: challenge.error,
            ...challenge.details,
          });
        },
      )(request, response, next);

  const verify = (
    authorization: string | undefined,
    ...strategies: StrategyName[]
  ) =>
    new Promise<AuthChallenge | Principal>((resolve, reject) => {
      // The strategies only read the Authorization header.
      const request = {
        header: (name: string) =>
          name.toLowerCase() === 'authorization'
            ? authorization
            : undefined,
        headers: { authorization },
      } as unknown as Request;
      (passport.authenticate as Authenticator)(
        strategies,
        { session: false },
        (
          error: unknown,
          user: Express.User | false,
          info: unknown,
        ) =>
          error
            ? reject(
                error instanceof Error
                  ? error
                  : new Error('Authentication failed', {
                      cause: error,
                    }),
              )
            : resolve(
                user
                  ? (user as Principal)
                  : selectChallenge(
                      Array.isArray(info) ? info : [info],
                    ),
              ),
      )(request, {} as Response, reject);
    });

  return Object.assign(middleware(false), {
    optional: middleware(true),
    verify,
  });
}

/** The failure that best explains the rejection: the first credential actually presented. */
export function selectChallenge(
  challenges: unknown[],
): AuthChallenge {
  const known = challenges.filter(isAuthChallenge);
  return (
    known.find((challenge) => challenge.presented) ??
    known[0] ??
    UNKNOWN
  );
}
