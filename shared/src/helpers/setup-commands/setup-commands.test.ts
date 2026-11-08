import { describe, expect, it } from 'vitest';
import {
  agentSetupCommands,
  curlEnrollCommand,
  curlInstallCommand,
  dockerComposeSnippet,
  dockerRunCommand,
  enrollSetupCommands,
  npxEnrollCommand,
  npxInstallCommand,
} from './setup-commands.js';

const server = 'https://print.example.org';
const credentials = {
  serverUrl: server,
  agentToken: 'tok_123',
  printerUri: 'cups://HP-LaserJet',
};

describe('setup commands', () => {
  it('builds the enrollment one-liner', () => {
    expect(curlEnrollCommand(server, 'abc')).toBe(
      'curl -sSL https://print.example.org/printer/abc/install | bash',
    );
  });

  it('builds the generic install one-liner with flags', () => {
    expect(curlInstallCommand(credentials)).toBe(
      'curl -sSL https://print.example.org/install.sh | bash -s -- --print-agent-token tok_123 --printer-uri cups://HP-LaserJet',
    );
  });

  it('builds npx commands', () => {
    expect(npxEnrollCommand(server, 'abc')).toBe(
      'npx @uwacwy/print-agent install --print-server-url https://print.example.org --print-enroll-token abc',
    );
    expect(npxInstallCommand(credentials)).toBe(
      'npx @uwacwy/print-agent install --print-server-url https://print.example.org --print-agent-token tok_123 --printer-uri cups://HP-LaserJet',
    );
  });

  it('quotes printer URIs with shell metacharacters', () => {
    expect(
      npxInstallCommand({
        ...credentials,
        printerUri: 'ipp://h/p?a=1&b',
      }),
    ).toContain(`--printer-uri 'ipp://h/p?a=1&b'`);
  });

  it('mounts the CUPS socket only for cups:// printers', () => {
    const cups = dockerComposeSnippet({
      ...credentials,
      slug: 'front',
    });
    expect(cups).toContain('  agent-front:');
    expect(cups).toContain(
      '/run/cups/cups.sock:/run/cups/cups.sock',
    );
    const ipp = dockerComposeSnippet({
      ...credentials,
      printerUri: 'ipp://printer.local/ipp/print',
    });
    expect(ipp).not.toContain('CUPS_SERVER');
    expect(ipp).toContain(
      'PRINTER_URI: "ipp://printer.local/ipp/print"',
    );
  });

  it('builds a docker run command', () => {
    expect(dockerRunCommand(credentials)).toContain(
      "-e PRINT_AGENT_TOKEN='tok_123'",
    );
  });
});

describe('setup command lists', () => {
  it('offers curl and npx for enrollment', () => {
    const commands = enrollSetupCommands(server, 'enroll_tok');
    expect(commands.map(({ id }) => id)).toEqual(['curl', 'npx']);
    expect(commands[1]!.command).toContain(
      '--print-enroll-token enroll_tok',
    );
  });

  it('offers curl, npx, and compose for a created printer', () => {
    const commands = agentSetupCommands({
      ...credentials,
      slug: 'front',
    });
    expect(commands.map(({ id }) => id)).toEqual([
      'curl',
      'npx',
      'compose',
    ]);
    expect(commands[2]!.command).toContain('  agent-front:');
  });
});
