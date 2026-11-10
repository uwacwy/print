import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type LiveEvent,
  LiveEventsService,
} from '../../services/live-events/live-events.service';
import {
  PrinterService,
  type PrinterSummary,
} from '../../services/printer/printer.service';
import { ManagePrintersComponent } from './manage-printers.component';

const frontOffice: PrinterSummary = {
  activeJobs: 2,
  coverPage: true,
  failedJobs: 0,
  id: 1,
  lastSeenAt: null,
  name: 'Front Office',
  online: false,
  pin: '123-456-789',
  qrEpoch: 0,
  queue: 'cups://Front_Office',
  slug: 'front-office',
};

async function setup(
  api: Partial<Record<keyof PrinterService, unknown>> = {},
) {
  const events = new Subject<LiveEvent>();
  await TestBed.configureTestingModule({
    imports: [ManagePrintersComponent],
    providers: [
      provideRouter([]),
      {
        provide: PrinterService,
        useValue: {
          listAdminPrinters: () => of([{ ...frontOffice }]),
          ...api,
        },
      },
      { provide: LiveEventsService, useValue: { events } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(
    ManagePrintersComponent,
  );
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(label),
    )!;
  return { button, element, events, fixture };
}

describe('ManagePrintersComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders each printer as an accordion with an accessible quick-action toolbar', async () => {
    const { element } = await setup();

    expect(element.querySelector('h1')?.textContent).toContain(
      'Printers',
    );
    const item = element.querySelector('li.printer')!;
    const summary = item.querySelector('details > summary')!;
    expect(summary.textContent).toContain('Front Office');
    expect(summary.textContent).toContain('Offline');
    expect(summary.querySelector('a, button')).toBeNull();
    expect(item.querySelector('details')?.textContent).toContain(
      'cups://Front_Office',
    );
    expect(item.querySelector('details')?.textContent).toContain(
      '123-456-789',
    );

    const toolbar = item.querySelector('[role="group"]')!;
    expect(toolbar.getAttribute('aria-label')).toBe(
      'Quick actions for Front Office',
    );
    expect(toolbar.closest('details')).toBeNull();
    const upload = toolbar.querySelector('a')!;
    expect(upload.getAttribute('href')).toBe(
      '/print/front-office',
    );
    expect(upload.getAttribute('target')).toBe('_blank');
    expect(toolbar.textContent).toContain(
      'Print QR sheet on Front Office',
    );
    const showQr = [...toolbar.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Show QR code for Front Office'),
    )!;
    expect(showQr.getAttribute('href')).toBe('/front-office/qr');
    expect(showQr.hasAttribute('target')).toBe(false);
    for (const icon of item.querySelectorAll('.bi')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }

    const panel = item.querySelector('details > div')!;
    for (const label of [
      'Configure',
      'QR code & PIN',
      'Rotate token',
      'Delete all jobs',
      'Remove printer',
    ]) {
      expect(panel.textContent).toContain(label);
    }
  });

  it('applies live agent and job events and announces them', async () => {
    const { element, events, fixture } = await setup();

    events.next({
      lastSeenAt: '2026-10-29T12:00:00Z',
      online: true,
      printerId: 1,
      type: 'agent',
    });
    events.next({
      activeJobs: 1,
      failedJobs: 0,
      jobId: 'a',
      printerId: 1,
      status: 'printing',
      type: 'job',
    });
    await fixture.whenStable();
    const summary = element.querySelector('summary')!;
    expect(summary.textContent).toContain('Online');
    expect(summary.textContent).toContain('1 active job');
    expect(
      element.querySelector('details')?.textContent,
    ).toContain('2026');

    events.next({
      activeJobs: 0,
      failedJobs: 0,
      jobId: 'a',
      printerId: 1,
      status: 'printed',
      type: 'job',
    });
    await fixture.whenStable();
    expect(
      element.querySelector('p[aria-live]')?.textContent,
    ).toContain('A job printed on Front Office.');

    events.next({
      activeJobs: 0,
      count: 3,
      failedJobs: 0,
      printerId: 1,
      type: 'jobs-deleted',
    });
    await fixture.whenStable();
    expect(
      element.querySelector('p[aria-live]')?.textContent,
    ).toContain('3 jobs deleted on Front Office.');
    events.next({ onlinePrinterIds: [], type: 'snapshot' });
    await fixture.whenStable();
    expect(
      element.querySelector('summary')?.textContent,
    ).toContain('Offline');
    expect(
      element.querySelector('summary')?.textContent,
    ).toContain('0 active jobs');
  });

  it('queues the QR sheet and reports the result', async () => {
    const printQrPoster = vi.fn(() =>
      of({ agentOnline: false, jobId: 'j' }),
    );
    const { button, element, fixture } = await setup({
      printQrPoster,
    });

    button('Print QR sheet').click();
    await fixture.whenStable();

    expect(printQrPoster).toHaveBeenCalledWith('front-office');
    expect(
      element.querySelector('[role="status"]')?.textContent,
    ).toContain('QR sheet queued');
  });

  it('rotates the token after confirmation and shows it once', async () => {
    const rotateAgentToken = vi.fn(() =>
      of({ agentToken: 'new-secret', printer: frontOffice }),
    );
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { button, element, fixture } = await setup({
      rotateAgentToken,
    });

    button('Rotate token').click();
    expect(rotateAgentToken).not.toHaveBeenCalled();
    button('Rotate token').click();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(
      element.querySelector('details pre code')?.textContent,
    ).toBe('new-secret');

    button('Done').click();
    await fixture.whenStable();
    expect(element.textContent).not.toContain('new-secret');
  });

  it('retries failed jobs, offering the action only when some failed', async () => {
    const retryFailedJobs = vi.fn(() =>
      of({
        printer: {
          ...frontOffice,
          activeJobs: 3,
          failedJobs: 0,
        },
        retried: 1,
      }),
    );
    const { button, element, fixture } = await setup({
      listAdminPrinters: () =>
        of([{ ...frontOffice, failedJobs: 1 }]),
      retryFailedJobs,
    });
    expect(
      element.querySelector('summary')?.textContent,
    ).toContain('1 failed');

    button('Retry failed jobs').click();
    await fixture.whenStable();
    expect(retryFailedJobs).toHaveBeenCalledWith('front-office');
    expect(
      element.querySelector('[role="status"]')?.textContent,
    ).toContain('Retried 1 job for Front Office.');
    expect(
      element.querySelector('summary')?.textContent,
    ).toContain('3 active jobs');
    expect(element.textContent).not.toContain(
      'Retry failed jobs',
    );
  });

  it('deletes all jobs and removes the printer after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteAllJobs = vi.fn(() =>
      of({
        deleted: 2,
        printer: { ...frontOffice, activeJobs: 0 },
      }),
    );
    const deleteAdminPrinter = vi.fn(() => of(undefined));
    const { button, element, fixture } = await setup({
      deleteAdminPrinter,
      deleteAllJobs,
    });

    button('Delete all jobs').click();
    await fixture.whenStable();
    expect(
      element.querySelector('summary')?.textContent,
    ).toContain('0 active jobs');
    expect(
      element.querySelector('[role="status"]')?.textContent,
    ).toContain('Deleted 2 jobs for Front Office.');

    button('Remove printer').click();
    await fixture.whenStable();
    expect(deleteAdminPrinter).toHaveBeenCalledWith(
      'front-office',
    );
    expect(element.querySelector('li.printer')).toBeNull();
    expect(element.textContent).toContain(
      'No printers configured.',
    );
  });

  it('shows a load failure and a dismissible action failure', async () => {
    const { element, fixture } = await setup({
      listAdminPrinters: () =>
        throwError(() => new Error('down')),
    });
    expect(
      element.querySelector('[role="alert"]')?.textContent,
    ).toContain('Unable to load printers.');
    element
      .querySelector<HTMLButtonElement>(
        '[aria-label="Dismiss error"]',
      )!
      .click();
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports the server message when an action fails', async () => {
    const { button, element, fixture } = await setup({
      printQrPoster: () =>
        throwError(() => ({
          error: { error: 'Agent unreachable' },
        })),
    });
    button('Print QR sheet').click();
    await fixture.whenStable();
    expect(
      element.querySelector('[role="alert"]')?.textContent,
    ).toContain('Agent unreachable');
  });
});
