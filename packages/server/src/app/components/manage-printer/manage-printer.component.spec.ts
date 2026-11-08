import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  LiveEventsService,
  type LiveEvent,
} from '../../services/live-events/live-events.service';
import { PrinterService } from '../../services/printer/printer.service';
import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';
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
                failedJobs: 0,
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
      failedJobs: 0,
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

  const addPage = async (
    enrollment: boolean,
    printers: Partial<PrinterService>,
  ) => {
    await TestBed.configureTestingModule({
      imports: [ManagePrinterComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'new' } } },
        },
        { provide: PrinterService, useValue: printers },
        {
          provide: CLIENT_ENVIRONMENT,
          useValue: {
            msal: { tenantId: '', clientId: '', redirectUri: '' },
            enrollment,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ManagePrinterComponent);
    await fixture.whenStable();
    return fixture;
  };

  it("creates a setup command for enrolling from the printer's computer", async () => {
    const fixture = await addPage(true, {
      createEnrollToken: () =>
        of({
          token: 'e'.repeat(44),
          expiresAt: '2030-01-01T00:00:00.000Z',
          serverUrl: 'https://print.example.org',
        }),
    });
    const page: HTMLElement = fixture.nativeElement;
    expect(
      page.querySelector<HTMLInputElement>('#add-mode-enroll')
        ?.checked,
    ).toBe(true);
    expect(page.querySelector('#printer-name')).toBeNull();

    page.querySelector<HTMLButtonElement>('section button')!.click();
    await fixture.whenStable();

    expect(page.textContent).toContain(
      `curl -sSL https://print.example.org/printer/${'e'.repeat(44)}/install | bash`,
    );
    expect(page.textContent).toContain(
      'npx @uwacwy/print-agent install',
    );
  });

  it('shows the token and setup commands after adding a printer here', async () => {
    const fixture = await addPage(false, {
      createAdminPrinter: () =>
        of({
          printer: {
            id: 2,
            slug: 'front',
            name: 'Front',
            queue: 'cups://Front',
            coverPage: false,
            lastSeenAt: null,
            activeJobs: 0,
            failedJobs: 0,
            online: false,
            pin: null,
            qrEpoch: 0,
          },
          agentToken: 'a'.repeat(43),
          serverUrl: 'https://print.example.org',
        }),
    });
    const page: HTMLElement = fixture.nativeElement;
    const enroll = page.querySelector<HTMLInputElement>(
      '#add-mode-enroll',
    )!;
    expect(enroll.disabled).toBe(true);
    expect(page.textContent).toContain('set PUBLIC_URL');

    fixture.componentInstance.form.setValue({
      name: 'Front',
      slug: 'front',
      queue: 'cups://Front',
      coverPage: false,
    });
    fixture.componentInstance.save();
    await fixture.whenStable();

    expect(page.textContent).toContain('a'.repeat(43));
    expect(page.textContent).toContain('--print-agent-token');
    expect(page.textContent).toContain('agent-front:');
  });
});
