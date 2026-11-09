import { describe, expect, it } from 'vitest';
import {
  defaultWindow,
  presetsForWindow,
  shiftLocalInput,
  toIsoWindow,
  toLocalInput,
  untilPresets,
  windowOrderError,
} from './qr-window';

describe('toLocalInput', () => {
  it('formats local wall-clock time for datetime-local inputs', () => {
    expect(toLocalInput(new Date(2030, 0, 2, 3, 4, 59))).toBe(
      '2030-01-02T03:04',
    );
  });
});

describe('untilPresets', () => {
  it('starts at the next whole local hour and marks hours on later days', () => {
    const presets = untilPresets(new Date(2030, 0, 2, 21, 5), 4);
    expect(presets.map(({ value }) => value)).toEqual([
      '2030-01-02T22:00',
      '2030-01-02T23:00',
      '2030-01-03T00:00',
      '2030-01-03T01:00',
    ]);
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
    expect(presets[0].label).toBe(time.format(new Date(2030, 0, 2, 22)));
    expect(presets[2].label).not.toBe(
      time.format(new Date(2030, 0, 3, 0)),
    );
    expect(presets[2].label).toContain(
      time.format(new Date(2030, 0, 3, 0)),
    );
  });

  it('skips to the following hour when already on the hour', () => {
    expect(untilPresets(new Date(2030, 0, 2, 13, 0), 1)[0].value).toBe(
      '2030-01-02T14:00',
    );
  });
});

describe('presetsForWindow', () => {
  const now = new Date(2030, 0, 2, 10, 30);

  it('counts from now when the window has started', () => {
    expect(presetsForWindow(now, '2030-01-02T09:00')[0].value).toBe(
      '2030-01-02T11:00',
    );
  });

  it('counts from a future start', () => {
    expect(presetsForWindow(now, '2030-01-02T15:20')[0].value).toBe(
      '2030-01-02T16:00',
    );
  });

  it('counts from now when the start is invalid', () => {
    expect(presetsForWindow(now, '')[0].value).toBe('2030-01-02T11:00');
  });
});

describe('window helpers', () => {
  it('defaults to 24 hours from now', () => {
    expect(defaultWindow(new Date(2030, 0, 2, 3, 4))).toEqual({
      notBefore: '2030-01-02T03:04',
      expiresAt: '2030-01-03T03:04',
    });
  });

  it('shifts by minutes and rejects invalid values', () => {
    expect(shiftLocalInput('2030-01-02T03:50', 15)).toBe(
      '2030-01-02T04:05',
    );
    expect(shiftLocalInput('2030-01-02T00:05', -15)).toBe(
      '2030-01-01T23:50',
    );
    expect(shiftLocalInput('', 15)).toBeUndefined();
  });

  it('converts local values to ISO timestamps', () => {
    const window = toIsoWindow({
      notBefore: '2030-01-02T03:04',
      expiresAt: '2030-01-03T03:04',
    });
    expect(window.notBefore).toBe(
      new Date(2030, 0, 2, 3, 4).toISOString(),
    );
    expect(window.expiresAt).toBe(
      new Date(2030, 0, 3, 3, 4).toISOString(),
    );
  });

  it('flags a window that ends at or before its start', () => {
    expect(windowOrderError('2030-01-02T03:00', '2030-01-02T03:00')).toBe(
      'Must be after the start time.',
    );
    expect(
      windowOrderError('2030-01-02T03:00', '2030-01-02T02:00'),
    ).toBeDefined();
    expect(
      windowOrderError('2030-01-02T03:00', '2030-01-02T04:00'),
    ).toBeUndefined();
    expect(windowOrderError('', '2030-01-02T04:00')).toBeUndefined();
  });
});
