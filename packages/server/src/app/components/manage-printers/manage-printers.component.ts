import { DOCUMENT } from '@angular/common';
import {
  Component,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  rxResource,
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { apiErrorMessage } from '../../helpers/api-error/api-error';
import { LiveEventsService } from '../../services/live-events/live-events.service';
import {
  PrinterService,
  type PrinterSummary,
} from '../../services/printer/printer.service';
import { AlertComponent } from '../alert/alert.component';
import { PrinterListItemComponent } from './components/printer-list-item/printer-list-item.component';
import {
  applyLiveEventToList,
  liveEventAnnouncement,
  patchPrinter,
  withoutPrinter,
} from './helpers/printer-list/printer-list';
import {
  deleteJobsPrompt,
  jobsDeletedNotice,
  printerRemovedNotice,
  qrSheetNotice,
  removePrinterPrompt,
  retriedNotice,
  rotateTokenPrompt,
  tokenRotatedNotice,
} from './helpers/printer-messages/printer-messages';

@Component({
  selector: 'app-manage-printers',
  imports: [AlertComponent, PrinterListItemComponent, RouterLink],
  styles: `
    :host {
      display: block;
    }
  `,
  template: `
    <main class="">
      <header
        class="d-flex align-items-center justify-content-between gap-3 mb-4"
      >
        <div>
          <p class="text-uppercase text-muted small mb-1">
            Administration
          </p>
          <h1 class="h2 mb-0">Printers</h1>
        </div>
        <a class="btn btn-primary" routerLink="new">
          <i class="bi bi-plus-lg" aria-hidden="true"></i> Add
          printer
        </a>
      </header>

      @if (error()) {
        <app-alert
          variant="danger"
          dismissLabel="Dismiss error"
          (dismissed)="error.set('')"
          >{{ error() }}</app-alert
        >
      }
      <div role="status" aria-live="polite" aria-atomic="true">
        @if (notice()) {
          <app-alert
            variant="success"
            [role]="null"
            dismissLabel="Dismiss message"
            (dismissed)="notice.set('')"
            >{{ notice() }}</app-alert
          >
        }
      </div>
      <p
        class="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ announcement() }}
      </p>

      @if (printersResource.isLoading()) {
        <p role="status">Loading printers...</p>
      } @else if (printers().length === 0) {
        <p class="text-muted">No printers configured.</p>
      } @else {
        <ul class="list-unstyled d-flex flex-column gap-2 mb-0">
          @for (printer of printers(); track printer.id) {
            <li
              app-printer-list-item
              [printer]="printer"
              [busy]="busyIds().has(printer.id)"
              [token]="tokens()[printer.id]"
              [serverUrl]="serverUrl"
              (printQr)="printQr(printer)"
              (rotateToken)="rotateToken(printer)"
              (retryFailedJobs)="retryFailedJobs(printer)"
              (deleteAllJobs)="deleteAllJobs(printer)"
              (removePrinter)="removePrinter(printer)"
              (dismissToken)="dismissToken(printer.id)"
            ></li>
          }
        </ul>
      }
    </main>
  `,
})
export class ManagePrintersComponent {
  readonly #printersApi = inject(PrinterService);
  readonly #document = inject(DOCUMENT);
  readonly serverUrl = this.#document.location?.origin ?? '';

  protected readonly printersResource = rxResource({
    stream: () => this.#printersApi.listAdminPrinters(),
  });
  /** Loaded printers, patched in place by live events and actions. */
  readonly printers = linkedSignal<PrinterSummary[]>(() =>
    this.printersResource.hasValue()
      ? this.printersResource.value()
      : [],
  );

  readonly error = linkedSignal<string>(() =>
    this.printersResource.error() ? 'Unable to load printers.' : '',
  );
  readonly notice = signal('');
  readonly announcement = signal('');
  readonly tokens = signal<Readonly<Record<number, string>>>({});
  protected readonly busyIds = signal<ReadonlySet<number>>(new Set());

  constructor() {
    inject(LiveEventsService)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        this.announcement.set(
          liveEventAnnouncement(this.printers(), event) ||
            this.announcement(),
        );
        this.printers.update((printers) =>
          applyLiveEventToList(printers, event),
        );
      });
  }

  printQr({ id, slug, name }: PrinterSummary): void {
    this.#run(
      id,
      this.#printersApi.printQrPoster(slug),
      ({ agentOnline }) =>
        this.notice.set(qrSheetNotice(name, agentOnline)),
    );
  }

  rotateToken({ id, slug, name }: PrinterSummary): void {
    if (!this.#confirm(rotateTokenPrompt(name))) {
      return;
    }
    this.#run(
      id,
      this.#printersApi.rotateAgentToken(slug),
      ({ agentToken }) => {
        this.tokens.update((tokens) => ({
          ...tokens,
          [id]: agentToken,
        }));
        this.notice.set(tokenRotatedNotice(name));
      },
    );
  }

  retryFailedJobs({ id, slug, name }: PrinterSummary): void {
    this.#run(
      id,
      this.#printersApi.retryFailedJobs(slug),
      ({ retried, printer: { activeJobs, failedJobs } }) => {
        this.printers.update((printers) =>
          patchPrinter(printers, id, { activeJobs, failedJobs }),
        );
        this.notice.set(retriedNotice(name, retried));
      },
    );
  }

  deleteAllJobs({ id, slug, name }: PrinterSummary): void {
    if (!this.#confirm(deleteJobsPrompt(name))) {
      return;
    }
    this.#run(
      id,
      this.#printersApi.deleteAllJobs(slug),
      ({ deleted }) => {
        this.printers.update((printers) =>
          patchPrinter(printers, id, { activeJobs: 0, failedJobs: 0 }),
        );
        this.notice.set(jobsDeletedNotice(name, deleted));
      },
    );
  }

  removePrinter({ id, slug, name }: PrinterSummary): void {
    if (!this.#confirm(removePrinterPrompt(name))) {
      return;
    }
    this.#run(id, this.#printersApi.deleteAdminPrinter(slug), () => {
      this.printers.update((printers) => withoutPrinter(printers, id));
      this.dismissToken(id);
      this.notice.set(printerRemovedNotice(name));
    });
  }

  dismissToken(id: number): void {
    this.tokens.update(({ [id]: _removed, ...rest }) => rest);
  }

  #run<T>(
    id: number,
    request: Observable<T>,
    next: (value: T) => void,
  ): void {
    this.error.set('');
    this.notice.set('');
    this.busyIds.update((busy) => new Set(busy).add(id));
    const done = () =>
      this.busyIds.update((busy) => {
        const remaining = new Set(busy);
        remaining.delete(id);
        return remaining;
      });
    void firstValueFrom(request).then(
      (value) => {
        done();
        next(value);
      },
      (error: unknown) => {
        done();
        this.error.set(
          apiErrorMessage(error, 'Request failed. Please try again.'),
        );
      },
    );
  }

  #confirm(message: string): boolean {
    return this.#document.defaultView?.confirm(message) ?? false;
  }
}
