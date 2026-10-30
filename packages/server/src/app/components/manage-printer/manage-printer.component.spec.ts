import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  LiveEventsService,
  type LiveEvent,
} from '../../services/live-events/live-events.service';
import { PrinterService } from '../../services/printer/printer.service';
import { ManagePrinterComponent } from './manage-printer.component';

describe('ManagePrinterComponent', () => {
  it('renders the selected printer management page with live agent status', async () => {
    const events = new Subject<LiveEvent>();
    await TestBed.configureTestingModule({
      imports: [ManagePrinterComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '1' } } },
        },
        {
          provide: PrinterService,
          useValue: {
            getAdminPrinter: () =>
              of({
                id: 1,
                slug: 'front-office',
                name: 'Front Office',
                queue: 'cups://Front_Office',
                coverPage: true,
                lastSeenAt: null,
                activeJobs: 0,
                online: false,
              }),
          },
        },
        { provide: LiveEventsService, useValue: { events } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ManagePrinterComponent);
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('h1')?.textContent,
    ).toContain('Edit printer');
    expect(
      fixture.nativeElement.querySelector('#printer-name')?.value,
    ).toBe('Front Office');
    expect(
      fixture.nativeElement.querySelector('#printer-queue')?.value,
    ).toBe('cups://Front_Office');
    expect(
      fixture.nativeElement.querySelector('#printer-cover-page')
        ?.checked,
    ).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Offline');

    events.next({
      type: 'agent',
      printerId: 1,
      online: true,
      lastSeenAt: null,
    });
    events.next({
      type: 'job',
      printerId: 1,
      jobId: 'job',
      status: 'queued',
      activeJobs: 3,
    });
    events.next({
      type: 'agent',
      printerId: 2,
      online: false,
      lastSeenAt: null,
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Online');
    expect(fixture.nativeElement.textContent).toContain(
      '3 active job(s)',
    );
  });
});
