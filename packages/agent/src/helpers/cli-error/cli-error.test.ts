import { describe, expect, it } from 'vitest';
import { CliError, exitCodeFor, expectedFailure } from './cli-error';
import { ServerError } from '../enroll-client/enroll-client';

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
        message: 'Cancelled.',
        exitCode: 130,
      }),
    );

    expect(
      expectedFailure(new ServerError('Slug taken.', 409)),
    ).toEqual(
      expect.objectContaining({
        message: 'Slug taken.',
        exitCode: 1,
      }),
    );

    const bug = new TypeError('undefined is not a function');
    expect(() => expectedFailure(bug)).toThrow(bug);
  });
});
