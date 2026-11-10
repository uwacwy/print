import { describe, expect, it } from 'vitest';

import {
  disablePinPrompt,
  pinDisabledNotice,
  pinRefreshedNotice,
  posterNotice,
  replacePinPrompt,
  revokedNotice,
  revokePrompt,
} from './qr-messages';

describe('posterNotice', () => {
  it('words the result by agent state', () => {
    expect(posterNotice('Front', true)).toBe(
      'QR poster sent to Front.',
    );
    expect(posterNotice('Front', false)).toContain(
      'QR poster queued',
    );
  });
});

describe('PIN and revoke messages', () => {
  it('name the printer in every prompt and notice', () => {
    for (const fn of [
      replacePinPrompt,
      pinRefreshedNotice,
      disablePinPrompt,
      pinDisabledNotice,
      revokePrompt,
      revokedNotice,
    ]) {
      expect(fn('Front')).toContain('Front');
    }
  });
});
