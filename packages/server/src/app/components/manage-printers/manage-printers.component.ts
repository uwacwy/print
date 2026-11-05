import { DatePipe, DOCUMENT } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import {
  LiveEventsService,
  type LiveEvent,
} from '../../services/live-events/live-events.service';
import {
  PrinterService,
  type PrinterSummary,
} from '../../services/printer/printer.service';

@Component({
  selector: 'app-manage-printers',
  imports: [DatePipe, RouterLink],
  styles: `
    :host {
      display: block;
    }
    .printer-details {
      flex: 1 1 auto;
      min-width: 0;
    }
    .printer-summary {
      padding: 0.75rem 1rem;
    }
    .printer-actions {
      flex-shrink: 0;
      margin: 0.5rem 0.75rem 0 0;
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
        <div
          class="alert alert-danger d-flex justify-content-between gap-2"
          role="alert"
        >
          <span>{{ error() }}</span>
          <button
            type="button"
            class="btn-close"
            aria-label="Dismiss error"
            (click)="error.set('')"
          ></button>
        </div>
      }
      <div role="status" aria-live="polite" aria-atomic="true">
        @if (notice()) {
          <div
            class="alert alert-success d-flex justify-content-between gap-2"
          >
            <span>{{ notice() }}</span>
            <button
              type="button"
              class="btn-close"
              aria-label="Dismiss message"
              (click)="notice.set('')"
            ></button>
          </div>
        }
      </div>
      <p
        class="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ announcement() }}
      </p>

      @if (loading()) {
        <p role="status">Loading printers...</p>
      } @else if (printers().length === 0) {
        <p class="text-muted">No printers configured.</p>
      } @else {
        <ul class="list-unstyled d-flex flex-column gap-2 mb-0">
          @for (printer of printers(); track printer.id) {
            @let busy = isBusy(printer.id);
            @let token = tokens()[printer.id];
            <li
              class="printer d-flex align-items-start border rounded"
              [attr.data-printer-id]="printer.id"
            >
              <details class="printer-details">
                <summary class="printer-summary">
                  <span class="fw-semibold me-1">{{
                    printer.name
                  }}</span>
                  @if (printer.online) {
                    <span class="badge text-bg-success">Online</span>
                  } @else {
                    <span class="badge text-bg-secondary"
                      >Offline</span
                    >
                  }
                  <span class="text-muted small ms-1">
                    {{ printer.activeJobs }} active
                    {{ printer.activeJobs === 1 ? 'job' : 'jobs' }}
                  </span>
                  @if (printer.failedJobs) {
                    <span class="badge text-bg-danger ms-1">
                      {{ printer.failedJobs }} failed
                    </span>
                  }
                </summary>

                <div class="px-3 pb-3">
                  <dl class="row small mb-3">
                    <dt class="col-sm-3">Upload page</dt>
                    <dd class="col-sm-9">
                      <a
                        [routerLink]="['/print', printer.slug]"
                        target="_blank"
                        rel="noopener"
                      >
                        /print/{{ printer.slug }}&nbsp;
                        <i
                          class="bi bi-box-arrow-up-right"
                          aria-hidden="true"
                        ></i>
                        <span class="visually-hidden"
                          >(opens in new tab)</span
                        >
                      </a>
                    </dd>
                    <dt class="col-sm-3">Upload PIN</dt>
                    <dd class="col-sm-9">
                      @if (printer.pin) {
                        <span class="font-monospace">{{
                          printer.pin
                        }}</span>
                      } @else {
                        Off (QR code only)
                      }
                    </dd>
                    <dt class="col-sm-3">Destination</dt>
                    <dd class="col-sm-9">
                      <code>{{ printer.queue }}</code>
                    </dd>
                    <dt class="col-sm-3">Cover page</dt>
                    <dd class="col-sm-9">
                      {{ printer.coverPage ? 'On' : 'Off' }}
                    </dd>
                    <dt class="col-sm-3">Agent last seen</dt>
                    <dd class="col-sm-9 mb-0">
                      {{
                        printer.lastSeenAt
                          ? (printer.lastSeenAt | date: 'medium')
                          : 'Never connected'
                      }}
                    </dd>
                  </dl>

                  @if (token) {
                    <section
                      class="alert alert-warning"
                      [attr.aria-labelledby]="
                        'token-heading-' + printer.id
                      "
                    >
                      <h2
                        class="h6"
                        [id]="'token-heading-' + printer.id"
                      >
                        New agent token (shown once)
                      </h2>
                      <p class="small mb-2">
                        The previous token no longer works.
                        Reconfigure the agent with server URL
                        <code>{{ serverUrl }}</code> and this token:
                      </p>
                      <code
                        class="d-block text-break user-select-all mb-2"
                        >{{ token }}</code
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-dark me-2"
                        (click)="copyToken(token)"
                      >
                        <i
                          class="bi bi-clipboard"
                          aria-hidden="true"
                        ></i>
                        Copy token
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-dark"
                        (click)="dismissToken(printer.id)"
                      >
                        Done
                      </button>
                    </section>
                  }

                  <div class="d-flex flex-wrap gap-2">
                    <a
                      class="btn btn-sm btn-outline-primary"
                      [routerLink]="[printer.slug]"
                    >
                      <i class="bi bi-gear" aria-hidden="true"></i>
                      Configure
                    </a>
                    <a
                      class="btn btn-sm btn-outline-primary"
                      [routerLink]="[printer.slug, 'qr']"
                    >
                      <i
                        class="bi bi-qr-code"
                        aria-hidden="true"
                      ></i>
                      QR code &amp; PIN
                    </a>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-warning"
                      [disabled]="busy"
                      (click)="rotateToken(printer)"
                    >
                      <i class="bi bi-key" aria-hidden="true"></i>
                      Rotate token
                    </button>
                    @if (printer.failedJobs) {
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-primary"
                        [disabled]="busy"
                        (click)="retryFailedJobs(printer)"
                      >
                        <i
                          class="bi bi-arrow-clockwise"
                          aria-hidden="true"
                        ></i>
                        Retry failed jobs
                      </button>
                    }
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger"
                      [disabled]="busy"
                      (click)="deleteAllJobs(printer)"
                    >
                      <i class="bi bi-trash3" aria-hidden="true"></i>
                      Delete all jobs
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-danger"
                      [disabled]="busy"
                      (click)="removePrinter(printer)"
                    >
                      <i
                        class="bi bi-x-octagon"
                        aria-hidden="true"
                      ></i>
                      Remove printer
                    </button>
                  </div>
                </div>
              </details>

              <div
                class="printer-actions btn-group btn-group-sm"
                role="group"
                [attr.aria-label]="
                  'Quick actions for ' + printer.name
                "
              >
                <a
                  class="btn btn-outline-secondary"
                  [routerLink]="['/print', printer.slug]"
                  target="_blank"
                  rel="noopener"
                  title="Open upload page"
                >
                  <i
                    class="bi bi-box-arrow-up-right"
                    aria-hidden="true"
                  ></i>
                  <span class="visually-hidden"
                    >Open upload page for {{ printer.name }} (opens
                    in new tab)</span
                  >
                </a>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  title="Print QR sheet"
                  [disabled]="busy"
                  (click)="printQr(printer)"
                >
                  <i class="bi bi-printer" aria-hidden="true"></i>
                  <span class="visually-hidden"
                    >Print QR sheet on {{ printer.name }}</span
                  >
                </button>
                <a
                  class="btn btn-outline-secondary"
                  title="Show QR code"
                  [routerLink]="[printer.slug, 'qr']"
                >
                  <i class="bi bi-qr-code" aria-hidden="true"></i>
                  <span class="visually-hidden"
                    >Show QR code for {{ printer.name }}</span
                  >
                </a>
              </div>
            </li>
          }
        </ul>
      }
    </main>
  `,
})
export class ManagePrintersComponent implements OnInit {
  readonly #printersApi = inject(PrinterService);
  readonly #document = inject(DOCUMENT);
  readonly printers = signal<PrinterSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly announcement = signal('');
  readonly tokens = signal<Readonly<Record<number, string>>>({});
  readonly #busy = signal<ReadonlySet<number>>(new Set());
  readonly serverUrl = this.#document.location?.origin ?? '';

  constructor() {
    inject(LiveEventsService)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => this.#applyLiveEvent(event));
  }

  ngOnInit(): void {
    this.#printersApi.listAdminPrinters().subscribe({
      next: (printers) => {
        this.printers.set(printers);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load printers.');
        this.loading.set(false);
      },
    });
  }

  isBusy(id: number): boolean {
    return this.#busy().has(id);
  }

  printQr(printer: PrinterSummary): void {
    this.#run(
      printer.id,
      this.#printersApi.printQrPoster(printer.slug),
      ({ agentOnline }) =>
        this.notice.set(
          agentOnline
            ? `QR sheet sent to ${printer.name}.`
            : `QR sheet queued. It prints when the ${printer.name} agent is online.`,
        ),
    );
  }

  rotateToken(printer: PrinterSummary): void {
    if (
      !this.#confirm(
        `Rotate the agent token for ${printer.name}? Its agent disconnects until it is reconfigured with the new token.`,
      )
    ) {
      return;
    }
    this.#run(
      printer.id,
      this.#printersApi.rotateAgentToken(printer.slug),
      ({ agentToken }) => {
        this.tokens.update((tokens) => ({
          ...tokens,
          [printer.id]: agentToken,
        }));
        this.notice.set(
          `Agent token rotated for ${printer.name}. Copy the new token below.`,
        );
      },
    );
  }

  retryFailedJobs(printer: PrinterSummary): void {
    this.#run(
      printer.id,
      this.#printersApi.retryFailedJobs(printer.slug),
      ({ retried, printer: updated }) => {
        this.#patch(printer.id, {
          activeJobs: updated.activeJobs,
          failedJobs: updated.failedJobs,
        });
        this.notice.set(
          retried
            ? `Retried ${retried} ${retried === 1 ? 'job' : 'jobs'} for ${printer.name}.`
            : `No failed jobs for ${printer.name} could be retried; their documents have expired.`,
        );
      },
    );
  }

  deleteAllJobs(printer: PrinterSummary): void {
    if (
      !this.#confirm(
        `Delete all jobs for ${printer.name}? Queued and in-progress documents will not print, and job history is removed.`,
      )
    ) {
      return;
    }
    this.#run(
      printer.id,
      this.#printersApi.deleteAllJobs(printer.slug),
      ({ deleted }) => {
        this.#patch(printer.id, { activeJobs: 0, failedJobs: 0 });
        this.notice.set(
          `Deleted ${deleted} ${deleted === 1 ? 'job' : 'jobs'} for ${printer.name}.`,
        );
      },
    );
  }

  removePrinter(printer: PrinterSummary): void {
    if (
      !this.#confirm(
        `Remove ${printer.name} and all of its jobs? This cannot be undone.`,
      )
    ) {
      return;
    }
    this.#run(
      printer.id,
      this.#printersApi.deleteAdminPrinter(printer.slug),
      () => {
        this.printers.update((printers) =>
          printers.filter(({ id }) => id !== printer.id),
        );
        this.dismissToken(printer.id);
        this.notice.set(`${printer.name} removed.`);
      },
    );
  }

  dismissToken(id: number): void {
    this.tokens.update(({ [id]: _removed, ...rest }) => rest);
  }

  async copyToken(token: string): Promise<void> {
    await this.#document.defaultView?.navigator.clipboard.writeText(
      token,
    );
    this.announcement.set('Token copied to clipboard.');
  }

  #run<T>(
    id: number,
    request: Observable<T>,
    next: (value: T) => void,
  ): void {
    this.error.set('');
    this.notice.set('');
    this.#busy.update((busy) => new Set(busy).add(id));
    const done = () =>
      this.#busy.update((busy) => {
        const remaining = new Set(busy);
        remaining.delete(id);
        return remaining;
      });
    request.subscribe({
      next: (value) => {
        done();
        next(value);
      },
      error: (error: unknown) => {
        done();
        this.error.set(
          this.#message(error, 'Request failed. Please try again.'),
        );
      },
    });
  }

  #confirm(message: string): boolean {
    return this.#document.defaultView?.confirm(message) ?? false;
  }

  #message(error: unknown, fallback: string): string {
    return typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'error' in error.error &&
      typeof error.error.error === 'string'
      ? error.error.error
      : fallback;
  }

  #applyLiveEvent(event: LiveEvent): void {
    if (event.type === 'snapshot') {
      const online = new Set(event.onlinePrinterIds);
      this.printers.update((printers) =>
        printers.map((printer) => ({
          ...printer,
          online: online.has(printer.id),
        })),
      );
      return;
    }
    const printer = this.printers().find(
      ({ id }) => id === event.printerId,
    );
    if (!printer) {
      return;
    }
    if (event.type === 'agent') {
      this.#patch(event.printerId, {
        online: event.online,
        lastSeenAt: event.lastSeenAt ?? printer.lastSeenAt,
      });
      this.announcement.set(
        `${printer.name} agent ${event.online ? 'connected' : 'disconnected'}.`,
      );
      return;
    }
    this.#patch(event.printerId, {
      activeJobs: event.activeJobs,
      failedJobs: event.failedJobs,
    });
    if (
      event.type === 'job' &&
      (event.status === 'printed' || event.status === 'failed')
    ) {
      this.announcement.set(
        `A job ${event.status} on ${printer.name}.`,
      );
    }
    if (event.type === 'jobs-deleted') {
      this.announcement.set(
        `${event.count} ${event.count === 1 ? 'job' : 'jobs'} deleted on ${printer.name}.`,
      );
    }
  }

  #patch(id: number, changes: Partial<PrinterSummary>): void {
    this.printers.update((printers) =>
      printers.map((printer) =>
        printer.id === id ? { ...printer, ...changes } : printer,
      ),
    );
  }
}
