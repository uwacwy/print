import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

import { PrinterAdminActionsComponent } from './printer-admin-actions.component';

const printer: PrinterSummary = {
  activeJobs: 0,
  coverPage: true,
  failedJobs: 2,
  id: 1,
  lastSeenAt: null,
  name: 'Front Office',
  online: false,
  pin: null,
  qrEpoch: 0,
  queue: 'cups://Front_Office',
  slug: 'front-office',
};

describe('PrinterAdminActionsComponent', () => {
  const create = (value = printer, busy = false) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(
      PrinterAdminActionsComponent,
    );
    fixture.componentRef.setInput('printer', value);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture;
  };
  const buttons = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button'));

  it('links to configuration and the QR code page', () => {
    const [configure, qr] = Array.from<HTMLAnchorElement>(
      create().nativeElement.querySelectorAll('a'),
    );
    expect(configure.getAttribute('href')).toBe('/front-office');
    expect(qr.getAttribute('href')).toBe('/front-office/qr');
  });

  it('emits each action', () => {
    const fixture = create();
    const events: string[] = [];
    const c = fixture.componentInstance;
    c.rotateToken.subscribe(() => events.push('rotate'));
    c.retryFailedJobs.subscribe(() => events.push('retry'));
    c.deleteAllJobs.subscribe(() => events.push('jobs'));
    c.removePrinter.subscribe(() => events.push('remove'));
    buttons(fixture.nativeElement).forEach((button) =>
      button.click(),
    );
    expect(events).toEqual([
      'rotate',
      'retry',
      'jobs',
      'remove',
    ]);
  });

  it('offers retry only when jobs failed', () => {
    const fixture = create({ ...printer, failedJobs: 0 });
    expect(fixture.nativeElement.textContent).not.toContain(
      'Retry failed jobs',
    );
  });

  it('disables every button while busy', () => {
    const fixture = create(printer, true);
    expect(
      buttons(fixture.nativeElement).every(
        (button) => button.disabled,
      ),
    ).toBe(true);
  });
});
