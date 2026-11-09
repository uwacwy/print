import { describe, expect, it } from 'vitest';
import type { CreatedPrinter } from '../../../../services/printer/printer.service';
import { createdPrinterCommands } from './created-printer-commands';

const created = (serverUrl: string | null): CreatedPrinter => ({
  printer: {
    id: 2,
    slug: 'front',
    name: 'Front',
    queue: 'cups://Front',
    coverPage: false,
    lastSeenAt: null,
    activeJobs: 0,
    failedJobs: 0,
    online: false,
    pin: null,
    qrEpoch: 0,
  },
  agentToken: 'a'.repeat(43),
  serverUrl,
});

describe('createdPrinterCommands', () => {
  it('returns only the token without a server URL', () => {
    expect(createdPrinterCommands(created(null))).toEqual([
      { id: 'token', label: 'Agent token', command: 'a'.repeat(43) },
    ]);
  });

  it('adds setup commands with a server URL', () => {
    const commands = createdPrinterCommands(
      created('https://print.example.org'),
    );
    expect(commands[0].id).toBe('token');
    expect(commands.length).toBeGreaterThan(1);
    expect(commands.some((c) => c.command.includes('agent-front:'))).toBe(
      true,
    );
  });
});
