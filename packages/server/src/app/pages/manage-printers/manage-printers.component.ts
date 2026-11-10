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
import { type PrinterSummary } from '@uwacwy/print-shared';
import { firstValueFrom, type Observable } from 'rxjs';

import { AlertComponent } from '../../components/alert/alert.component';
import { apiErrorMessage } from '../../helpers/api-error/api-error';
import { LiveEventsService } from '../../services/live-events/live-events.service';
import { PrinterService } from '../../services/printer/printer.service';
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
  imports: [
    AlertComponent,
    PrinterListItemComponent,
    RouterLink,
  ],
  selector: 'app-manage-printers',
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
          <p
            i18n="@@manage-printers.administration"
            class="text-uppercase text-muted small mb-1"
          >
            Administration
          </p>
          <h1 i18n="@@manage-printers.printers" class="h2 mb-0">
            Printers
          </h1>
        </div>
        <a
          i18n="@@manage-printers.add-printer-if-error"
          class="btn btn-primary"
          routerLink="new"
        >
          <i class="bi bi-plus-lg" aria-hidden="true"></i> Add
          printer
        </a>
      </header>

      @if (error()) {
        <app-alert
          variant="danger"
          dismissLabel="Dismiss error"
          i18n-dismissLabel="
            @@manage-printers.dismiss-error.dismisslabel"
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
            i18n-dismissLabel="
              @@manage-printers.dismiss-message.dismisslabel"
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
        <p
          i18n="@@manage-printers.loading-printers"
          role="status"
        >
          Loading printers...
        </p>
      } @else if (printers().length === 0) {
        <p
          i18n="@@manage-printers.no-printers-configured"
          class="text-muted"
        >
          No printers configured.
        </p>
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
  readonly announcement = signal('');
  protected readonly printersResource = rxResource({
    stream: () => this.#printersApi.listAdminPrinters(),
  });
  readonly error = linkedSignal<string>(() =>
    this.printersResource.error()
      ? $localize`:@@manage-printers.load-error:Unable to load printers.`
      : '',
  );

  readonly notice = signal('');
  /** Loaded printers, patched in place by live events and actions. */
  readonly printers = linkedSignal<PrinterSummary[]>(() =>
    this.printersResource.hasValue()
      ? this.printersResource.value()
      : [],
  );

  readonly #document = inject(DOCUMENT);
  readonly serverUrl = this.#document.location?.origin ?? '';
  readonly tokens = signal<Readonly<Record<number, string>>>({});
  protected readonly busyIds = signal<ReadonlySet<number>>(
    new Set(),
  );
  readonly #printersApi = inject(PrinterService);

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

  deleteAllJobs({ id, name, slug }: PrinterSummary): void {
    if (!this.#confirm(deleteJobsPrompt(name))) {
      return;
    }
    this.#run(
      id,
      this.#printersApi.deleteAllJobs(slug),
      ({ deleted }) => {
        this.printers.update((printers) =>
          patchPrinter(printers, id, {
            activeJobs: 0,
            failedJobs: 0,
          }),
        );
        this.notice.set(jobsDeletedNotice(name, deleted));
      },
    );
  }

  dismissToken(id: number): void {
    this.tokens.update(({ [id]: _removed, ...rest }) => rest);
  }

  printQr({ id, name, slug }: PrinterSummary): void {
    this.#run(
      id,
      this.#printersApi.printQrPoster(slug),
      ({ agentOnline }) =>
        this.notice.set(qrSheetNotice(name, agentOnline)),
    );
  }

  removePrinter({ id, name, slug }: PrinterSummary): void {
    if (!this.#confirm(removePrinterPrompt(name))) {
      return;
    }
    this.#run(
      id,
      this.#printersApi.deleteAdminPrinter(slug),
      () => {
        this.printers.update((printers) =>
          withoutPrinter(printers, id),
        );
        this.dismissToken(id);
        this.notice.set(printerRemovedNotice(name));
      },
    );
  }

  retryFailedJobs({ id, name, slug }: PrinterSummary): void {
    this.#run(
      id,
      this.#printersApi.retryFailedJobs(slug),
      ({ printer: { activeJobs, failedJobs }, retried }) => {
        this.printers.update((printers) =>
          patchPrinter(printers, id, { activeJobs, failedJobs }),
        );
        this.notice.set(retriedNotice(name, retried));
      },
    );
  }

  rotateToken({ id, name, slug }: PrinterSummary): void {
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

  #confirm(message: string): boolean {
    return this.#document.defaultView?.confirm(message) ?? false;
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
          apiErrorMessage(
            error,
            'Request failed. Please try again.',
          ),
        );
      },
    );
  }
}
