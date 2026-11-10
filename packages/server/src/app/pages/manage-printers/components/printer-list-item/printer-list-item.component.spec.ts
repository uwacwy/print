import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type PrinterSummary } from '@uwacwy/print-shared';
import { describe, expect, it } from 'vitest';

import { PrinterListItemComponent } from './printer-list-item.component';

const printer: PrinterSummary = {
  activeJobs: 1,
  coverPage: true,
  failedJobs: 2,
  id: 1,
  lastSeenAt: null,
  name: 'Front Office',
  online: true,
  pin: null,
  qrEpoch: 0,
  queue: 'cups://Front_Office',
  slug: 'front-office',
};

describe('PrinterListItemComponent', () => {
  const create = (inputs: Record<string, unknown> = {}) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(
      PrinterListItemComponent,
    );
    fixture.componentRef.setInput('printer', printer);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  };

  it('summarizes the printer', () => {
    const el: HTMLElement = create().nativeElement;
    expect(el.getAttribute('data-printer-id')).toBe('1');
    const summary = el.querySelector('summary')!.textContent;
    expect(summary).toContain('Front Office');
    expect(summary).toContain('Online');
    expect(summary).toContain('1 active job');
    expect(summary).toContain('2 failed');
  });

  it('omits the rotated token notice by default', () => {
    expect(create().nativeElement.textContent).not.toContain(
      'New agent token',
    );
  });

  it('shows a rotated token when one is given', () => {
    const el: HTMLElement = create({
      token: 'secret',
    }).nativeElement;
    expect(el.querySelector('details')?.textContent).toContain(
      'secret',
    );
  });

  it('forwards child actions', () => {
    const fixture = create({ token: 'secret' });
    const events: string[] = [];
    const c = fixture.componentInstance;
    c.printQr.subscribe(() => events.push('qr'));
    c.rotateToken.subscribe(() => events.push('rotate'));
    c.dismissToken.subscribe(() => events.push('dismiss'));
    const click = (label: string) =>
      Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      )
        .find((b) => b.textContent?.includes(label))!
        .click();
    click('Print QR sheet');
    click('Rotate token');
    click('Done');
    expect(events).toEqual(['qr', 'rotate', 'dismiss']);
  });

  it('passes busy to its buttons', () => {
    const fixture = create({ busy: true });
    expect(
      Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      ).every((b) => b.disabled),
    ).toBe(true);
  });
});
