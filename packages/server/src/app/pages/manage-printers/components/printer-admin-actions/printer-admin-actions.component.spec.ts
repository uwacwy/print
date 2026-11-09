import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { PrinterSummary } from '../../../../services/printer/printer.service';
import { PrinterAdminActionsComponent } from './printer-admin-actions.component';

const printer: PrinterSummary = {
  id: 1,
  slug: 'front-office',
  name: 'Front Office',
  queue: 'cups://Front_Office',
  coverPage: true,
  lastSeenAt: null,
  activeJobs: 0,
  failedJobs: 2,
  online: false,
  pin: null,
  qrEpoch: 0,
};

describe('PrinterAdminActionsComponent', () => {
  const create = (value = printer, busy = false) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PrinterAdminActionsComponent);
    fixture.componentRef.setInput('printer', value);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture;
  };
  const buttons = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button'));

  it('links to configuration and the QR code page', () => {
    const [configure, qr] = Array.from(
      create().nativeElement.querySelectorAll('a'),
    ) as HTMLAnchorElement[];
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
    buttons(fixture.nativeElement).forEach((button) => button.click());
    expect(events).toEqual(['rotate', 'retry', 'jobs', 'remove']);
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
      buttons(fixture.nativeElement).every((button) => button.disabled),
    ).toBe(true);
  });
});
