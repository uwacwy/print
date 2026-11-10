import { describe, expect, it } from 'vitest';

import {
  AgentHello,
  AgentPrinterUpdate,
  EnrollResponse,
  EnrollTokenResponse,
} from './enroll';

describe('enroll schemas', () => {
  it('parses an enrollment response', () => {
    const response = {
      agentToken: 'tok',
      printer: { name: 'Front', queue: 'q', slug: 'front' },
    };
    expect(EnrollResponse.parse(response)).toEqual(response);
    expect(
      EnrollResponse.safeParse({ ...response, printer: {} })
        .success,
    ).toBe(false);
  });

  it('parses the enroll token, queue update and hello', () => {
    expect(
      EnrollTokenResponse.safeParse({
        expiresAt: 'x',
        serverUrl: 'https://s',
        token: 't',
      }).success,
    ).toBe(true);
    expect(
      AgentPrinterUpdate.safeParse({ queue: 1 }).success,
    ).toBe(false);
    expect(
      AgentHello.safeParse({ name: 'n', slug: 's' }).success,
    ).toBe(true);
  });
});
