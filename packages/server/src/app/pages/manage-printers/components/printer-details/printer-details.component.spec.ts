import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

import { PrinterDetailsComponent } from './printer-details.component';

const printer: PrinterSummary = {
  activeJobs: 0,
  coverPage: true,
  failedJobs: 0,
  id: 1,
  lastSeenAt: null,
  name: 'Front Office',
  online: false,
  pin: null,
  qrEpoch: 0,
  queue: 'cups://Front_Office',
  slug: 'front-office',
};

describe('PrinterDetailsComponent', () => {
  const render = (value: PrinterSummary) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(
      PrinterDetailsComponent,
    );
    fixture.componentRef.setInput('printer', value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('links to the upload page in a new tab', () => {
    const link = render(printer).querySelector('a')!;
    expect(link.getAttribute('href')).toBe(
      '/print/front-office',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toContain('(opens in new tab)');
  });

  it('shows fallbacks for a missing PIN and last seen time', () => {
    const text = render(printer).textContent;
    expect(text).toContain('Off (QR code only)');
    expect(text).toContain('Never connected');
    expect(text).toContain('cups://Front_Office');
    expect(text).toContain('On');
  });

  it('shows the PIN and last seen time when known', () => {
    const text = render({
      ...printer,
      coverPage: false,
      lastSeenAt: '2026-10-29T12:00:00Z',
      pin: '123-456-789',
    }).textContent;
    expect(text).toContain('123-456-789');
    expect(text).toContain('2026');
    expect(text).not.toContain('Never connected');
  });
});
