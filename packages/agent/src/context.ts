import type { CommandContext } from '@stricli/core';
import type { StricliAutoCompleteContext } from '@stricli/auto-complete';

export interface LocalContext
  extends CommandContext, StricliAutoCompleteContext {
  readonly process: NodeJS.Process;
}

export const isInteractive = ({ process }: LocalContext): boolean =>
  !!process.stdin.isTTY && !!process.stdout.isTTY;
