import { DatePipe, DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required, validate } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { toString as qrSvg } from 'qrcode';
import {
  PrinterService,
  type IssuedQrToken,
  type PrinterSummary,
} from '../../services/printer/printer.service';

interface TokenWindow {
  notBefore: string;
  expiresAt: string;
}

const DEFAULT_WINDOW_MS = 24 * 3_600_000;
const PRESET_COUNT = 8;

export interface UntilPreset {
  label: string;
  /** datetime-local value */
  value: string;
}

/**
 * Whole-hour end times in the browser's time zone, starting with the first hour after
 * `from`. Hours on a later day than `from` are labelled with the weekday.
 */
export function untilPresets(from: Date, count = PRESET_COUNT): UntilPreset[] {
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  first.setHours(first.getHours() + 1);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
  const dayAndTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric' });
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(first);
    at.setHours(first.getHours() + index);
    const sameDay = at.toDateString() === from.toDateString();
    return { label: (sameDay ? time : dayAndTime).format(at), value: toLocalInput(at) };
  });
}

/** Formats a date for `<input type="datetime-local">`, which expects local wall-clock time. */
export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function apiMessage(error: unknown, fallback: string): string {
  const body =
    typeof error === 'object' && error !== null && 'error' in error ? error.error : undefined;
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : fallback;
}

@Component({
  selector: 'app-printer-qr',
  imports: [DatePipe, RouterLink, FormField, FormRoot],
  styles: `
    .qr-image {
      width: 16rem;
      height: 16rem;
    }
    .qr-details {
      min-width: 16rem;
    }
  `,
  template: `
    <main>
      <p class="mb-2">
        <a routerLink="/manage"><i class="bi bi-arrow-left" aria-hidden="true"></i> Printers</a>
      </p>

      @if (loading()) {
        <p role="status">Loading printer...</p>
      } @else if (printer(); as printer) {
        <h1 class="h2 mb-4">QR code &amp; PIN for {{ printer.name }}</h1>

        @if (error()) {
          <div class="alert alert-danger" role="alert">{{ error() }}</div>
        }
        <div role="status" aria-live="polite" aria-atomic="true">
          @if (notice()) {
            <div class="alert alert-success">{{ notice() }}</div>
          }
        </div>

        <section class="mb-5" aria-labelledby="qr-heading">
          <h2 class="h4" id="qr-heading">QR code</h2>
          <p class="text-muted">
            Anyone with this QR code (or its link) can upload to {{ printer.name }} during the window
            below, without a PIN.
          </p>

          <form [formRoot]="windowForm" class="row g-3 align-items-start mb-4">
            <div class="col-lg-6">
              <label class="form-label" for="qr-not-before">Valid from</label>
              <div class="input-group">
                <input
                  id="qr-not-before"
                  class="form-control"
                  type="datetime-local"
                  [formField]="windowForm.notBefore"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  (click)="nudge('notBefore', -15)"
                >
                  −15 min<span class="visually-hidden"> (valid from)</span>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  (click)="nudge('notBefore', 15)"
                >
                  +15 min<span class="visually-hidden"> (valid from)</span>
                </button>
              </div>
            </div>
            <div class="col-lg-6">
              <label class="form-label" for="qr-expires-at">Valid until</label>
              <div class="input-group">
                <input
                  id="qr-expires-at"
                  class="form-control"
                  type="datetime-local"
                  [class.is-invalid]="!!expiresAtError()"
                  [attr.aria-errormessage]="expiresAtError() ? 'qr-expires-at-error' : null"
                  [formField]="windowForm.expiresAt"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  (click)="nudge('expiresAt', -15)"
                >
                  −15 min<span class="visually-hidden"> (valid until)</span>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  (click)="nudge('expiresAt', 15)"
                >
                  +15 min<span class="visually-hidden"> (valid until)</span>
                </button>
              </div>
              @if (expiresAtError(); as message) {
                <div id="qr-expires-at-error" class="invalid-feedback d-block" role="alert">
                  {{ message }}
                </div>
              }
            </div>
            @if (presets().length) {
              <div class="col-12 d-flex flex-wrap align-items-center gap-2">
                <span id="qr-until-presets" class="fw-semibold">Until:</span>
                <div
                  class="d-flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby="qr-until-presets"
                >
                  @for (preset of presets(); track preset.value) {
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class.btn-secondary]="preset.value === windowForm.expiresAt().value()"
                      [class.btn-outline-secondary]="preset.value !== windowForm.expiresAt().value()"
                      [attr.aria-pressed]="preset.value === windowForm.expiresAt().value()"
                      (click)="windowForm.expiresAt().value.set(preset.value)"
                    >
                      {{ preset.label }}
                    </button>
                  }
                </div>
              </div>
            }
            <div class="col-12">
              <button class="btn btn-primary" type="submit" [disabled]="busy()">
                {{ issued() ? 'Regenerate' : 'Generate' }}
              </button>
            </div>
          </form>

          @if (issued(); as issued) {
            <div class="d-flex flex-wrap gap-4 align-items-start">
              @if (qrImage(); as qrImage) {
                <img
                  class="qr-image border rounded"
                  [src]="qrImage"
                  [alt]="'QR code linking to the print page for ' + printer.name"
                />
              }
              <div class="qr-details flex-grow-1">
                <p class="mb-2">
                  Valid {{ issued.notBefore | date: 'medium' }} to
                  {{ issued.expiresAt | date: 'medium' }}
                </p>
                <p class="mb-2">
                  <a
                    class="print-link"
                    [routerLink]="['/print', printer.slug]"
                    [queryParams]="{ token: issued.token }"
                    target="_blank"
                    rel="noopener"
                  >
                    Open print page
                    <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
                    <span class="visually-hidden">(opens in new tab)</span>
                  </a>
                </p>
                <code class="d-block small text-break user-select-all mb-3">{{ issued.url }}</code>
                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    (click)="copyLink(issued)"
                  >
                    <i class="bi bi-clipboard" aria-hidden="true"></i> Copy link
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    [disabled]="busy()"
                    (click)="openPoster(printer, issued)"
                  >
                    <i class="bi bi-file-earmark-pdf" aria-hidden="true"></i> Open poster PDF
                    <span class="visually-hidden">(opens in new tab)</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    [disabled]="busy()"
                    (click)="printPoster(printer, issued)"
                  >
                    <i class="bi bi-printer" aria-hidden="true"></i> Print poster on
                    {{ printer.name }}
                  </button>
                </div>
              </div>
            </div>
          }
        </section>

        <section class="mb-5" aria-labelledby="pin-heading">
          <h2 class="h4" id="pin-heading">Upload PIN</h2>
          @if (printer.pin; as pin) {
            <p>
              Visitors without the QR code can enter this PIN to get a short-lived upload link:
              <strong class="pin font-monospace fs-4 ms-2">{{ pin }}</strong>
            </p>
          } @else {
            <p class="text-muted">PIN uploads are off. Only QR codes work for this printer.</p>
          }
          <div class="d-flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-outline-primary"
              [disabled]="busy()"
              (click)="refreshPin(printer)"
            >
              <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
              {{ printer.pin ? 'Refresh PIN' : 'Turn on PIN' }}
            </button>
            @if (printer.pin) {
              <button
                type="button"
                class="btn btn-outline-danger"
                [disabled]="busy()"
                (click)="disablePin(printer)"
              >
                Turn off PIN
              </button>
            }
          </div>
        </section>

        <section aria-labelledby="revoke-heading">
          <h2 class="h4" id="revoke-heading">Revoke access</h2>
          <p class="text-muted">
            Stops every QR code and PIN link issued so far for {{ printer.name }}, including printed
            posters. The PIN itself keeps working.
          </p>
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="revoke(printer)">
            <i class="bi bi-x-octagon" aria-hidden="true"></i> Revoke all QR codes
          </button>
        </section>
      } @else {
        <h1 class="h2">Printer not found</h1>
      }
    </main>
  `,
})
export class PrinterQrComponent {
  readonly #api = inject(PrinterService);
  readonly #document = inject(DOCUMENT);
  readonly #id = Number(inject(ActivatedRoute).snapshot.paramMap.get('printer_id'));

  readonly loading = signal(true);
  readonly printer = signal<PrinterSummary | undefined>(undefined);
  readonly issued = signal<IssuedQrToken | undefined>(undefined);
  readonly qrImage = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly #window = signal<TokenWindow>({ notBefore: '', expiresAt: '' });
  readonly windowForm = form(
    this.#window,
    (path) => {
      required(path.notBefore, { message: 'Choose when the QR code starts working.' });
      required(path.expiresAt, { message: 'Choose when the QR code stops working.' });
      validate(path.expiresAt, ({ value, valueOf }) => {
        const start = Date.parse(valueOf(path.notBefore));
        const end = Date.parse(value());
        return Number.isFinite(start) && Number.isFinite(end) && end <= start
          ? { kind: 'window', message: 'Must be after the start time.' }
          : undefined;
      });
    },
    { submission: { action: () => this.#issue() } },
  );
  /** Captured in the browser so presets use the admin's clock and time zone. */
  readonly #now = signal<Date | undefined>(undefined);
  readonly presets = computed(() => {
    const now = this.#now();
    if (!now) return [];
    const start = Date.parse(this.windowForm.notBefore().value());
    return untilPresets(Number.isFinite(start) && start > now.getTime() ? new Date(start) : now);
  });
  readonly expiresAtError = computed(() => {
    const field = this.windowForm.expiresAt();
    return field.touched() ? (field.errors()[0]?.message ?? '') : '';
  });

  constructor() {
    // Wall-clock defaults belong to the browser, not the server render.
    afterNextRender(() => {
      const now = new Date();
      this.#now.set(now);
      this.#window.set({
        notBefore: toLocalInput(now),
        expiresAt: toLocalInput(new Date(now.getTime() + DEFAULT_WINDOW_MS)),
      });
    });
    this.#api.getAdminPrinter(this.#id).subscribe({
      next: (printer) => {
        this.printer.set(printer);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  async #issue(): Promise<undefined> {
    const { notBefore, expiresAt } = this.#window();
    this.#begin();
    try {
      const issued = await firstValueFrom(
        this.#api.issueQrToken(this.#id, {
          notBefore: new Date(notBefore).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
        }),
      );
      this.issued.set(issued);
      const svg = await qrSvg(issued.url, { type: 'svg', margin: 2 });
      this.qrImage.set(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      this.notice.set('QR code generated.');
    } catch (error) {
      this.error.set(apiMessage(error, 'Unable to generate a QR code.'));
    } finally {
      this.busy.set(false);
    }
    return undefined;
  }

  /** Shifts a window boundary by whole minutes, keeping local wall-clock time. */
  nudge(field: keyof TokenWindow, minutes: number): void {
    const state = this.windowForm[field]();
    const current = Date.parse(state.value());
    if (!Number.isFinite(current)) return;
    state.value.set(toLocalInput(new Date(current + minutes * 60_000)));
    state.markAsTouched();
  }

  async copyLink(issued: IssuedQrToken): Promise<void> {
    await this.#document.defaultView?.navigator.clipboard.writeText(issued.url);
    this.notice.set('Link copied to clipboard.');
  }

  openPoster(printer: PrinterSummary, issued: IssuedQrToken): void {
    const view = this.#document.defaultView;
    // Open the tab during the click so pop-up blockers allow it, then point it at the PDF.
    const tab = view?.open('', '_blank');
    if (!view || !tab) {
      this.error.set('Allow pop-ups for this site to view the QR poster.');
      return;
    }
    tab.opener = null;
    this.#run(
      this.#api.getQrPoster(printer.id, { token: issued.token }),
      (pdf) => {
        const url = URL.createObjectURL(pdf);
        tab.location.href = url;
        view.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      () => tab.close(),
    );
  }

  printPoster(printer: PrinterSummary, issued: IssuedQrToken): void {
    this.#run(this.#api.printQrPoster(printer.id, { token: issued.token }), ({ agentOnline }) =>
      this.notice.set(
        agentOnline
          ? `QR poster sent to ${printer.name}.`
          : `QR poster queued. It prints when the ${printer.name} agent is online.`,
      ),
    );
  }

  refreshPin(printer: PrinterSummary): void {
    if (
      printer.pin &&
      !this.#confirm(`Replace the PIN for ${printer.name}? The old PIN stops working.`)
    )
      return;
    this.#run(this.#api.refreshPin(printer.id), (updated) => {
      this.printer.set(updated);
      this.notice.set(`New PIN for ${printer.name} is ready.`);
    });
  }

  disablePin(printer: PrinterSummary): void {
    if (!this.#confirm(`Turn off PIN uploads for ${printer.name}? Only QR codes will work.`))
      return;
    this.#run(this.#api.disablePin(printer.id), (updated) => {
      this.printer.set(updated);
      this.notice.set(`PIN uploads turned off for ${printer.name}.`);
    });
  }

  revoke(printer: PrinterSummary): void {
    if (
      !this.#confirm(
        `Revoke every QR code and PIN link for ${printer.name}? Printed posters stop working and must be replaced.`,
      )
    )
      return;
    this.#run(this.#api.revokeQrCodes(printer.id), (updated) => {
      this.printer.set(updated);
      this.issued.set(undefined);
      this.qrImage.set('');
      this.notice.set(`All QR codes for ${printer.name} were revoked.`);
    });
  }

  #begin(): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
  }

  #run<T>(request: Observable<T>, next: (value: T) => void, failed?: () => void): void {
    this.#begin();
    request.subscribe({
      next: (value) => {
        this.busy.set(false);
        next(value);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        failed?.();
        this.error.set(apiMessage(error, 'Request failed. Please try again.'));
      },
    });
  }

  #confirm(message: string): boolean {
    return this.#document.defaultView?.confirm(message) ?? false;
  }
}
