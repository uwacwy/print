import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type PrinterSummary } from '@uwacwy/print-shared';
import { describe, expect, it } from 'vitest';

import { PrinterQuickActionsComponent } from './printer-quick-actions.component';

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

describe('PrinterQuickActionsComponent', () => {
  const create = (busy = false) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(
      PrinterQuickActionsComponent,
    );
    fixture.componentRef.setInput('printer', printer);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture;
  };

  it('is a labelled toolbar with accessible names for icon-only controls', () => {
    const el: HTMLElement = create().nativeElement;
    expect(
      el
        .querySelector('[role="group"]')!
        .getAttribute('aria-label'),
    ).toBe('Quick actions for Front Office');
    expect(el.textContent).toContain(
      'Open upload page for Front Office (opens in new tab)',
    );
    expect(el.textContent).toContain(
      'Print QR sheet on Front Office',
    );
    expect(el.textContent).toContain(
      'Show QR code for Front Office',
    );
    for (const icon of el.querySelectorAll('.bi')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('links to the upload page and QR code', () => {
    const [upload, qr] = Array.from<HTMLAnchorElement>(
      create().nativeElement.querySelectorAll('a'),
    );
    expect(upload.getAttribute('href')).toBe(
      '/print/front-office',
    );
    expect(upload.getAttribute('target')).toBe('_blank');
    expect(qr.getAttribute('href')).toBe('/front-office/qr');
    expect(qr.hasAttribute('target')).toBe(false);
  });

  it('emits printQr, but not while busy', () => {
    const fixture = create();
    let printed = 0;
    fixture.componentInstance.printQr.subscribe(() => printed++);
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    button.click();
    expect(printed).toBe(1);

    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });
});
