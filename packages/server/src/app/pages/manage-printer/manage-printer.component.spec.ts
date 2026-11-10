import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LiveEvent } from '@uwacwy/print-shared';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';
import { LiveEventsService } from '../../services/live-events/live-events.service';
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
          useValue: {
            snapshot: { paramMap: { get: () => '1' } },
          },
        },
        {
          provide: PrinterService,
          useValue: {
            getAdminPrinter: () =>
              of({
                activeJobs: 0,
                coverPage: true,
                failedJobs: 0,
                id: 1,
                lastSeenAt: null,
                name: 'Front Office',
                online: false,
                queue: 'cups://Front_Office',
                slug: 'front-office',
              }),
          },
        },
        { provide: LiveEventsService, useValue: { events } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(
      ManagePrinterComponent,
    );
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('h1')?.textContent,
    ).toContain('Edit printer');
    expect(
      fixture.nativeElement.querySelector('#printer-name')
        ?.value,
    ).toBe('Front Office');
    expect(
      fixture.nativeElement.querySelector('#printer-queue')
        ?.value,
    ).toBe('cups://Front_Office');
    expect(
      fixture.nativeElement.querySelector('#printer-cover-page')
        ?.checked,
    ).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Offline',
    );

    events.next({
      lastSeenAt: null,
      online: true,
      printerId: 1,
      type: 'agent',
    });
    events.next({
      activeJobs: 3,
      failedJobs: 0,
      jobId: 'job',
      printerId: 1,
      status: 'queued',
      type: 'job',
    });
    events.next({
      lastSeenAt: null,
      online: false,
      printerId: 2,
      type: 'agent',
    });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      'Online',
    );
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
          useValue: {
            snapshot: { paramMap: { get: () => 'new' } },
          },
        },
        { provide: PrinterService, useValue: printers },
        {
          provide: CLIENT_ENVIRONMENT,
          useValue: {
            enrollment,
            msal: {
              clientId: '',
              redirectUri: '',
              tenantId: '',
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(
      ManagePrinterComponent,
    );
    await fixture.whenStable();
    return fixture;
  };

  it("creates a setup command for enrolling from the printer's computer", async () => {
    const fixture = await addPage(true, {
      createEnrollToken: () =>
        of({
          expiresAt: '2030-01-01T00:00:00.000Z',
          serverUrl: 'https://print.example.org',
          token: 'e'.repeat(44),
        }),
    });
    const page: HTMLElement = fixture.nativeElement;
    expect(
      page.querySelector<HTMLInputElement>('#add-mode-enroll')
        ?.checked,
    ).toBe(true);
    expect(page.querySelector('#printer-name')).toBeNull();

    page
      .querySelector<HTMLButtonElement>('section button')!
      .click();
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
          agentToken: 'a'.repeat(43),
          printer: {
            activeJobs: 0,
            coverPage: false,
            failedJobs: 0,
            id: 2,
            lastSeenAt: null,
            name: 'Front',
            online: false,
            pin: null,
            qrEpoch: 0,
            queue: 'cups://Front',
            slug: 'front',
          },
          serverUrl: 'https://print.example.org',
        }),
    });
    const page: HTMLElement = fixture.nativeElement;
    const enroll = page.querySelector<HTMLInputElement>(
      '#add-mode-enroll',
    )!;
    expect(enroll.disabled).toBe(true);
    expect(page.textContent).toContain('set PUBLIC_URL');

    const type = (id: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('#printer-name', 'Front');
    type('#printer-slug', 'front');
    type('#printer-queue', 'cups://Front');
    page
      .querySelector<HTMLButtonElement>('button[type=submit]')!
      .click();
    await fixture.whenStable();

    expect(page.textContent).toContain('a'.repeat(43));
    expect(page.textContent).toContain('--print-agent-token');
    expect(page.textContent).toContain('agent-front:');
  });

  it('shows the server message and stays on the form when saving fails', async () => {
    const fixture = await addPage(false, {
      createAdminPrinter: () =>
        throwError(() => ({
          error: { error: 'Slug already used' },
        })),
    });
    const page: HTMLElement = fixture.nativeElement;
    page
      .querySelector<HTMLButtonElement>('button[type=submit]')!
      .click();
    await fixture.whenStable();
    expect(page.textContent).not.toContain('Slug already used');
    expect(page.textContent).toContain('Enter a display name.');

    const type = (id: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('#printer-name', 'Front');
    type('#printer-slug', 'front');
    type('#printer-queue', 'cups://Front');
    page
      .querySelector<HTMLButtonElement>('button[type=submit]')!
      .click();
    await fixture.whenStable();

    expect(
      page.querySelector('[role=alert]')?.textContent,
    ).toContain('Slug already used');
    expect(page.querySelector('#printer-name')).not.toBeNull();
  });
});
