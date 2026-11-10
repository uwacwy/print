import { describe, expect, it } from 'vitest';

import { AgentJob, JobId, JobReport, JobStatus } from './job';

describe('job schemas', () => {
  it('validates job ids as uuids', () => {
    expect(JobId.safeParse(crypto.randomUUID()).success).toBe(
      true,
    );
    expect(JobId.safeParse('../etc/passwd').success).toBe(false);
  });

  it('knows the job statuses', () => {
    expect(JobStatus.safeParse('printing').success).toBe(true);
    expect(JobStatus.safeParse('lost').success).toBe(false);
  });

  it('discriminates job reports', () => {
    expect(JobReport.parse({ status: 'printed' })).toEqual({
      status: 'printed',
    });
    expect(
      JobReport.safeParse({ status: 'failed' }).success,
    ).toBe(false);
    expect(
      JobReport.safeParse({ error: 'jam', status: 'failed' })
        .success,
    ).toBe(true);
  });

  it('requires an id and title on agent jobs', () => {
    expect(AgentJob.safeParse({ id: 'a' }).success).toBe(false);
  });
});
