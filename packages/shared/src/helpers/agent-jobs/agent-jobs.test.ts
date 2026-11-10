import { describe, expect, it } from 'vitest';
import { parseAgentJobs } from './agent-jobs';

describe('parseAgentJobs', () => {
  it('accepts a list of jobs', () => {
    const jobs = [{ id: 'a', title: 'Doc' }];
    expect(parseAgentJobs(jobs)).toBe(jobs);
  });

  it('rejects malformed values', () => {
    expect(parseAgentJobs([{ id: 1, title: 'x' }])).toBeUndefined();
    expect(parseAgentJobs({})).toBeUndefined();
    expect(parseAgentJobs([null])).toBeUndefined();
  });
});
