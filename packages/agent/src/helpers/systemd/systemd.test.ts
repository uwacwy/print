import { describe, expect, it } from 'vitest';
import {
  isEphemeralInstall,
  renderUnit,
  serviceScope,
  stableNodePath,
  systemctlArgs,
  systemdArg,
  unitPath,
} from './systemd';

describe('systemd', () => {
  it('picks the scope and unit location', () => {
    expect(serviceScope(0)).toBe('system');
    expect(serviceScope(1000)).toBe('user');
    expect(unitPath('system', '/root', {})).toBe(
      '/etc/systemd/system/uwacwy-print-agent.service',
    );
    expect(unitPath('user', '/home/print', {})).toBe(
      '/home/print/.config/systemd/user/uwacwy-print-agent.service',
    );
    expect(
      unitPath('user', '/home/print', { XDG_CONFIG_HOME: '/xdg' }),
    ).toBe('/xdg/systemd/user/uwacwy-print-agent.service');
    expect(systemctlArgs('user', 'daemon-reload')).toEqual([
      '--user',
      'daemon-reload',
    ]);
    expect(systemctlArgs('system', 'daemon-reload')).toEqual([
      'daemon-reload',
    ]);
  });

  it('spots npx cache installs', () => {
    expect(
      isEphemeralInstall(
        '/home/p/.npm/_npx/abc/node_modules/@uwacwy/print-agent/dist/cli.mjs',
      ),
    ).toBe(true);
    expect(
      isEphemeralInstall(
        '/home/p/.local/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs',
      ),
    ).toBe(false);
  });

  it('prefers the unversioned node on PATH', () => {
    const execPath = '/home/p/.local/opt/node-v24.1.0/bin/node';
    expect(
      stableNodePath({
        execPath,
        execRealpath: execPath,
        pathNode: '/home/p/.local/bin/node',
        pathNodeRealpath: execPath,
      }),
    ).toBe('/home/p/.local/bin/node');
    expect(
      stableNodePath({
        execPath,
        execRealpath: execPath,
        pathNode: '/usr/bin/node',
        pathNodeRealpath: '/usr/bin/node',
      }),
    ).toBe(execPath);
    expect(
      stableNodePath({ execPath, execRealpath: execPath }),
    ).toBe(execPath);
  });

  it('escapes ExecStart words', () => {
    expect(systemdArg('/usr/bin/node')).toBe('/usr/bin/node');
    expect(systemdArg('/a b/100%$x')).toBe('"/a b/100%%$$x"');
  });

  it('renders a hardened system unit', () => {
    const unit = renderUnit({
      scope: 'system',
      nodePath: '/usr/local/bin/node',
      cliPath:
        '/usr/local/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs',
      configPath: '/etc/uwacwy-print-agent.env',
    });
    expect(unit).toContain(
      'ExecStart=/usr/local/bin/node /usr/local/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs run --config /etc/uwacwy-print-agent.env',
    );
    expect(unit).toContain('User=uwacwy-print');
    expect(unit).toContain('ProtectHome=true');
    expect(unit).toContain('WantedBy=multi-user.target');
    expect(unit).not.toContain('EnvironmentFile');
  });

  it('passes --insecure through', () => {
    expect(
      renderUnit({
        scope: 'user',
        nodePath: '/n',
        cliPath: '/c',
        configPath: '/e',
        insecure: true,
      }),
    ).toContain('ExecStart=/n /c run --config /e --insecure');
  });

  it('keeps home directories readable when the agent lives there', () => {
    expect(
      renderUnit({
        scope: 'system',
        nodePath: '/root/.local/bin/node',
        cliPath: '/usr/local/lib/x/cli.mjs',
        configPath: '/etc/x.env',
      }),
    ).toContain('ProtectHome=read-only');
  });

  it('renders a user unit', () => {
    const unit = renderUnit({
      scope: 'user',
      nodePath: '/home/print/.local/bin/node',
      cliPath:
        '/home/print/.local/lib/node_modules/@uwacwy/print-agent/dist/cli.mjs',
      configPath: '/home/print/.config/uwacwy-print-agent.env',
    });
    expect(unit).not.toContain('User=');
    expect(unit).not.toContain('--insecure');
    expect(unit).not.toContain('ProtectSystem');
    expect(unit).toContain('WantedBy=default.target');
  });
});
