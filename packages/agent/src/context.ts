import type { StricliAutoCompleteContext } from '@stricli/auto-complete';
import type { CommandContext } from '@stricli/core';

export interface LocalContext
  extends CommandContext, StricliAutoCompleteContext {
  readonly process: NodeJS.Process;
}

export const isInteractive = ({
  process,
}: LocalContext): boolean =>
  !!process.stdin.isTTY && !!process.stdout.isTTY;
