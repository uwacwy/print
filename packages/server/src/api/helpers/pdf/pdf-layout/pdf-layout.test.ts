import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { winAnsi } from './pdf-layout';

describe('winAnsi', () => {
  it('turns the Unicode spaces Intl emits into plain spaces and keeps the en dash', () => {
    const range = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Denver',
    }).formatRange(
      new Date('2026-10-29T23:37:00Z'),
      new Date('2026-10-30T02:00:00Z'),
    );
    expect(winAnsi(range)).toBe('Oct 29, 2026, 5:37 – 8:00 PM');
  });

  it('keeps Latin-1 and WinAnsi punctuation and replaces the rest', () => {
    expect(winAnsi('Café “quoted” — 10€ …')).toBe(
      'Café “quoted” — 10€ …',
    );
    expect(winAnsi('Łódź 📚')).toBe('?ód? ?');
    expect(winAnsi('non\u2011breaking')).toBe('non-breaking');
  });

  it('only keeps characters the standard fonts can encode', async () => {
    const font = await (
      await PDFDocument.create()
    ).embedFont(StandardFonts.Helvetica);
    const all = winAnsi(
      Array.from({ length: 0x2200 }, (_, code) =>
        String.fromCharCode(code),
      ).join(''),
    );
    expect(() =>
      font.encodeText(all.replace(/\?/g, '')),
    ).not.toThrow();
  });
});
