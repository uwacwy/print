import { type CreatedPrinter } from '@uwacwy/print-shared';
import { describe, expect, it } from 'vitest';

import { createdPrinterCommands } from './created-printer-commands';

const created = (serverUrl: null | string): CreatedPrinter => ({
  agentToken: 'a'.repeat(43),
  printer: {
    activeJobs: 0,
    coverPage: false,
    failedJobs: 0,
    id: 2,
    lastSeenAt: null,
    name: 'Front',
    online: false,
    pin: null,
    qrEpoch: 0,
    queue: 'cups://Front',
    slug: 'front',
  },
  serverUrl,
});

describe('createdPrinterCommands', () => {
  it('returns only the token without a server URL', () => {
    expect(createdPrinterCommands(created(null))).toEqual([
      {
        command: 'a'.repeat(43),
        id: 'token',
        label: 'Agent token',
      },
    ]);
  });

  it('adds setup commands with a server URL', () => {
    const commands = createdPrinterCommands(
      created('https://print.example.org'),
    );
    expect(commands[0].id).toBe('token');
    expect(commands.length).toBeGreaterThan(1);
    expect(
      commands.some((c) => c.command.includes('agent-front:')),
    ).toBe(true);
  });
});
