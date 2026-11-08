import { describe, expect, it } from 'vitest';
import {
  configCandidates,
  configErrors,
  defaultWriteTarget,
  isComplete,
  mergeConfig,
  missingKeys,
  missingSettingsMessage,
  parseConfigFile,
  permissionWarning,
  serializeConfig,
} from './config';

const token = 'a'.repeat(43);
const complete = {
  PRINT_SERVER_URL: 'https://print.example.org',
  PRINT_AGENT_TOKEN: token,
  PRINTER_URI: 'cups://Front_Desk',
};

describe('config', () => {
  it('searches per-user, local, then host-wide config', () => {
    expect(configCandidates({}, '/home/pi')).toEqual([
      '/home/pi/.config/uwacwy-print-agent.env',
      '/usr/local/etc/uwacwy-print-agent.env',
      '/etc/uwacwy-print-agent.env',
    ]);
    expect(
      configCandidates({ XDG_CONFIG_HOME: '/xdg' }, '/home/pi')[0],
    ).toBe('/xdg/uwacwy-print-agent.env');
    // Relative XDG paths are invalid per the spec.
    expect(
      configCandidates({ XDG_CONFIG_HOME: 'xdg' }, '/home/pi')[0],
    ).toBe('/home/pi/.config/uwacwy-print-agent.env');
  });

  it('writes host-wide config only as root', () => {
    const candidates = configCandidates({}, '/root');
    expect(defaultWriteTarget(0, candidates)).toBe(
      '/etc/uwacwy-print-agent.env',
    );
    expect(
      defaultWriteTarget(1000, configCandidates({}, '/home/pi')),
    ).toBe('/home/pi/.config/uwacwy-print-agent.env');
  });

  it('lets environment variables win over the file, ignoring blanks', () => {
    const merged = mergeConfig(
      {
        PRINT_SERVER_URL: 'https://env.example.org',
        PRINTER_URI: ' ',
      },
      {
        PRINT_SERVER_URL: 'https://file.example.org',
        PRINTER_URI: 'cups://Q',
      },
    );
    expect(merged).toEqual({
      PRINT_SERVER_URL: 'https://env.example.org',
      PRINTER_URI: 'cups://Q',
    });
    expect(missingKeys(merged)).toEqual(['PRINT_AGENT_TOKEN']);
    expect(isComplete(merged)).toBe(false);
    expect(isComplete(complete)).toBe(true);
  });

  it('round-trips through the file format, keeping URI query strings literal', () => {
    const config = {
      ...complete,
      PRINTER_URI:
        'cups://Q?option_sides=two-sided-long-edge&x=$HOME#frag',
    };
    const text = serializeConfig(config);
    expect(text).toContain(`PRINT_AGENT_TOKEN='${token}'`);
    expect(parseConfigFile(text)).toEqual(config);
    expect(() =>
      serializeConfig({ ...complete, PRINTER_URI: "cups://it's" }),
    ).toThrow('quotes');
  });

  it('reports invalid values', () => {
    expect(configErrors(complete)).toEqual([]);
    expect(
      configErrors({
        PRINT_SERVER_URL: 'http://print.example.org',
        PRINT_AGENT_TOKEN: 'short',
        PRINTER_URI: 'lpd://x',
      }),
    ).toEqual([
      expect.stringContaining('PRINT_SERVER_URL must use https://'),
      expect.stringContaining(
        'PRINT_AGENT_TOKEN must be the 43-character',
      ),
      expect.stringContaining('PRINTER_URI must be cups://'),
    ]);
    expect(
      configErrors(
        { ...complete, PRINT_SERVER_URL: 'http://print.lan' },
        { insecure: true },
      ),
    ).toEqual([]);
  });

  it('warns about world-readable token files', () => {
    expect(
      permissionWarning('/etc/x.env', 0o100640),
    ).toBeUndefined();
    expect(permissionWarning('/etc/x.env', 0o100644)).toContain(
      'mode 644',
    );
  });

  it('explains missing settings', () => {
    const message = missingSettingsMessage(
      ['PRINTER_URI'],
      ['/etc/uwacwy-print-agent.env'],
      'CUPS queues:\n  cups://Q',
    );
    expect(message).toContain('Missing settings: PRINTER_URI.');
    expect(message).toContain('  /etc/uwacwy-print-agent.env');
    expect(message).toContain(
      '(for PRINTER_URI):\nCUPS queues:\n  cups://Q',
    );
    expect(missingSettingsMessage(['X'], [])).not.toContain(
      'PRINTER_URI',
    );
  });
});
