/** Missing or invalid settings: the operator must change the command or config. */
export const EXIT_USAGE = 2;
/** Interrupted at a prompt (Ctrl-C), as shells report SIGINT. */
export const EXIT_CANCELLED = 130;

/** An expected failure: Stricli prints only its message (no stack) and exits with `exitCode`. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export const exitCodeFor = (error: unknown): number =>
  error instanceof CliError ? error.exitCode : 1;

/**
 * Turns expected failures into a returned `Error` (message only), and rethrows anything else
 * so Stricli prints its stack. `ServerError`s and prompt cancellations are expected.
 */
export function expectedFailure(error: unknown): Error {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof Error && error.name === 'ExitPromptError') {
    return new CliError('Cancelled.', EXIT_CANCELLED);
  }
  if (
    error instanceof Error &&
    (error.name === 'ServerError' ||
      error.message.startsWith('Could not reach '))
  ) {
    return new CliError(error.message);
  }
  throw error;
}
