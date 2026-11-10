import { describe, expect, it } from 'vitest';

import { ServerError } from '../enroll-client/enroll-client';
import {
  CliError,
  exitCodeFor,
  expectedFailure,
} from './cli-error';

describe('cli-error', () => {
  it('maps exit codes', () => {
    expect(exitCodeFor(new CliError('x', 2))).toBe(2);
    expect(exitCodeFor(new Error('x'))).toBe(1);
  });

  it('returns expected failures and rethrows the rest', () => {
    const usage = new CliError('Missing PRINTER_URI.', 2);
    expect(expectedFailure(usage)).toBe(usage);

    const cancelled = Object.assign(
      new Error('User force closed the prompt'),
      {
        name: 'ExitPromptError',
      },
    );
    expect(expectedFailure(cancelled)).toEqual(
      expect.objectContaining({
        exitCode: 130,
        message: 'Cancelled.',
      }),
    );

    expect(
      expectedFailure(new ServerError('Slug taken.', 409)),
    ).toEqual(
      expect.objectContaining({
        exitCode: 1,
        message: 'Slug taken.',
      }),
    );

    const bug = new TypeError('undefined is not a function');
    expect(() => expectedFailure(bug)).toThrow(bug);
  });
});
