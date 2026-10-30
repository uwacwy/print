import type { NextFunction, Request, Response } from 'express';
import { Passport } from 'passport';
import type { PrintDatabase } from '../../../lib/database/database.js';
import type { UploadTokenKey } from '../../../lib/upload-token/upload-token.js';
import { AgentTokenStrategy } from './agent-token.strategy';
import {
  createEntraUserStrategy,
  type EntraUserOptions,
} from './entra-user.strategy';
import { PinStrategy } from './pin.strategy';
import { isAuthChallenge, type AuthChallenge } from './principal';
import { UploadTokenStrategy } from './upload-token.strategy';

export type StrategyName =
  | 'entraUser'
  | 'uploadToken'
  | 'pin'
  | 'agentToken';

export interface AuthOptions {
  db: PrintDatabase;
  /** Registers `entraUser` (unconfigured tenants answer 503 to presented JWTs). */
  entra?: EntraUserOptions;
  /** Registers `uploadToken`. */
  uploadToken?: UploadTokenKey;
}

/** Generic over route params so it never widens Express 5's typed `request.params`. */
export type AuthMiddleware = <P>(
  request: Request<P>,
  response: Response,
  next: NextFunction,
) => void;

export interface Authenticate {
  /** Accepts the first strategy that succeeds, in order; otherwise responds 401/403/503. */
  (...strategies: StrategyName[]): AuthMiddleware;
  /** Like `authenticate`, but continues anonymously when every strategy declines. */
  optional(...strategies: StrategyName[]): AuthMiddleware;
}

const UNKNOWN: AuthChallenge = {
  code: 'unauthorized',
  error: 'Unauthorized',
  status: 401,
  presented: false,
};

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

/** Builds an isolated Passport instance and its per-route `authenticate(...)` middleware. */
export function createAuthenticate({
  db,
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

  const middleware =
    (optional: boolean) =>
    (...strategies: StrategyName[]): AuthMiddleware =>
    (request, response, next) =>
      passport.authenticate(
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

  return Object.assign(middleware(false), {
    optional: middleware(true),
  });
}
