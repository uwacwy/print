import { describe, expect, it } from 'vitest';
import {
  agentJobFilePath,
  agentJobStatusPath,
  installScriptPath,
} from './paths';

describe('paths', () => {
  it('encodes job ids', () => {
    expect(agentJobFilePath('a/b')).toBe(
      '/api/agent/jobs/a%2Fb/file',
    );
    expect(agentJobStatusPath('x')).toBe('/api/agent/jobs/x/status');
  });

  it('builds install script paths', () => {
    expect(installScriptPath()).toBe('/install.sh');
    expect(installScriptPath('tok_-1')).toBe(
      '/printer/tok_-1/install',
    );
  });
});
