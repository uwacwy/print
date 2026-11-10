import type { Request } from 'express';

import {
  type AugmentedRequest,
  ipKeyGenerator,
  rateLimit,
} from 'express-rate-limit';

import type { UploadConfig } from '../../helpers/server-config/server-config';

import { pinCredential } from '../auth/credentials';

const minutesUntil = (request: Request) => {
  const resetTime = (request as AugmentedRequest)['rateLimit']
    ?.resetTime;
  return Math.max(
    1,
    Math.ceil(
      ((resetTime?.getTime() ?? Date.now()) - Date.now()) /
        60_000,
    ),
  );
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Upload requests per client per minute. */
export const uploadRateLimit = ({
  access,
  uploadsPerMinute,
}: UploadConfig) =>
  rateLimit({
    ipv6Subnet: access.ipv6Subnet,
    legacyHeaders: false,
    limit: uploadsPerMinute,
    message: {
      error: 'Too many uploads. Wait a minute and try again.',
    },
    standardHeaders: 'draft-8',
    windowMs: 60_000,
  });

/**
 * Counts only rejected PINs, per client and printer, to stop guessing. Share one instance across
 * every route that accepts `Authorization: Pin` so the lockout cannot be sidestepped.
 */
export const pinFailureRateLimit = ({ access }: UploadConfig) =>
  rateLimit({
    handler: (request, response) =>
      response.status(429).json({
        code: 'pin_locked',
        error: `Too many incorrect PINs. Try again in ${plural(minutesUntil(request), 'minute')}.`,
      }),
    keyGenerator: (request) =>
      `${ipKeyGenerator(request.ip ?? '', access.ipv6Subnet)}|${String(request.params['slug'])}`,
    legacyHeaders: false,
    limit: access.pinMaxFailures,
    requestWasSuccessful: (_request, response) =>
      response.statusCode !== 401,
    skip: (request) => pinCredential(request) === undefined,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    windowMs: 15 * 60_000,
  });

/** One PIN-exchanged upload token per client per interval, across all printers. */
export const pinIssuanceRateLimit = ({ access }: UploadConfig) =>
  rateLimit({
    handler: (request, response) =>
      response.status(429).json({
        code: 'pin_rate_limited',
        error: `A print code was already issued to this device. Try again in ${plural(minutesUntil(request), 'minute')}.`,
      }),
    ipv6Subnet: access.ipv6Subnet,
    legacyHeaders: false,
    limit: 1,
    skipFailedRequests: true,
    standardHeaders: 'draft-8',
    windowMs: access.pinTokenIntervalMs,
  });

/** Self-enrollments per client every 15 minutes; enrollment tokens are multi-use until they expire. */
export const enrollRateLimit = ({ access }: UploadConfig) =>
  rateLimit({
    handler: (request, response) =>
      response.status(429).json({
        code: 'enroll_rate_limited',
        error: `Too many enrollment attempts. Try again in ${plural(minutesUntil(request), 'minute')}.`,
      }),
    ipv6Subnet: access.ipv6Subnet,
    legacyHeaders: false,
    limit: 10,
    standardHeaders: 'draft-8',
    windowMs: 15 * 60_000,
  });

/** Install script downloads per client per minute. */
export const installScriptRateLimit = ({
  access,
}: UploadConfig) =>
  rateLimit({
    handler: (_request, response) =>
      response
        .status(429)
        .type('text/x-shellscript')
        .send(
          'echo "Too many install requests. Wait a minute and try again." >&2\nexit 1\n',
        ),
    ipv6Subnet: access.ipv6Subnet,
    legacyHeaders: false,
    limit: 20,
    standardHeaders: 'draft-8',
    windowMs: 60_000,
  });
