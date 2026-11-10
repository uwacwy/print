import { describe, expect, it } from 'vitest';

import { errorMessage, jobTitle } from './text';

describe('jobTitle', () => {
  it('replaces control characters with spaces', () => {
    expect(jobTitle({ title: 'W-2\n2024\t\x7f' })).toBe(
      'W-2 2024  ',
    );
  });

  it('truncates to 120 characters', () => {
    expect(jobTitle({ title: 'x'.repeat(200) })).toHaveLength(
      120,
    );
  });

  it('falls back when the title is empty', () => {
    expect(jobTitle({ title: '' })).toBe('Print job');
  });
});

describe('errorMessage', () => {
  it('uses an Error message, truncated to 500 characters', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe(
      'boom',
    );
    expect(
      errorMessage(new Error('x'.repeat(600)), 'fallback'),
    ).toHaveLength(500);
  });

  it('falls back for non-Error values', () => {
    expect(errorMessage('boom', 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
