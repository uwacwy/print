import { proposeCompletions, run } from '@stricli/core';

import { app, COMPLETE_COMMAND } from './app';

const [command, ...rest] = process.argv.slice(2);

if (command === COMPLETE_COMMAND) {
  // bash passes the whole line, program name first; a trailing space means a new word.
  const inputs = rest.slice(1);
  if (process.env['COMP_LINE']?.endsWith(' ')) {
    inputs.push('');
  }
  void proposeCompletions(app, inputs, { process }).then(
    (completions) => {
      for (const { completion } of completions) {
        process.stdout.write(`${completion}\n`);
      }
    },
  );
} else {
  void run(app, process.argv.slice(2), { process });
}
