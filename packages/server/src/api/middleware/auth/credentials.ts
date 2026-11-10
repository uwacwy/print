import type { Request } from 'express';

export interface Credential {
  scheme: string;
  value: string;
}

/** Parses `Authorization: <scheme> <value>`, lower-casing the scheme. */
export function credential(
  request: Request,
): Credential | undefined {
  const match = /^([A-Za-z][\w-]*)\s+(\S(?:.*\S)?)\s*$/.exec(
    request.header('authorization') ?? '',
  );
  return match
    ? { scheme: match[1].toLowerCase(), value: match[2] }
    : undefined;
}

export const bearer = (request: Request) => {
  const found = credential(request);
  return found?.scheme === 'bearer' ? found.value : undefined;
};

const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
export const isJwtShaped = (
  value: string | undefined,
): value is string => !!value && JWT_SHAPE.test(value);

/** The PIN from `Authorization: Pin 111-222-333`. */
export const pinCredential = (request: Request) => {
  const found = credential(request);
  return found?.scheme === 'pin' ? found.value : undefined;
};
