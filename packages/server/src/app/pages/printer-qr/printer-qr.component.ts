import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  form,
  required,
  validate,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { apiErrorMessage } from '../../helpers/api-error/api-error';
import {
  PrinterService,
  type IssuedQrToken,
  type PrinterSummary,
} from '../../services/printer/printer.service';
import { AlertComponent } from '../../components/alert/alert.component';
import { PinSectionComponent } from './components/pin-section/pin-section.component';
import { QrIssuedComponent } from './components/qr-issued/qr-issued.component';
import { QrWindowFormComponent } from './components/qr-window-form/qr-window-form.component';
import { RevokeSectionComponent } from './components/revoke-section/revoke-section.component';
import { qrDataUri } from './helpers/qr-image/qr-image';
import {
  disablePinPrompt,
  pinDisabledNotice,
  pinRefreshedNotice,
  posterNotice,
  replacePinPrompt,
  revokedNotice,
  revokePrompt,
} from './helpers/qr-messages/qr-messages';
import {
  defaultWindow,
  toIsoWindow,
  windowOrderError,
  type QrWindow,
} from './helpers/qr-window/qr-window';

@Component({
  selector: 'app-printer-qr',
  imports: [
    RouterLink,
    AlertComponent,
    PinSectionComponent,
    QrIssuedComponent,
    QrWindowFormComponent,
    RevokeSectionComponent,
  ],
  template: `
    <main>
      <p class="mb-2">
        <a routerLink="/manage"
          ><i class="bi bi-arrow-left" aria-hidden="true"></i>
          Printers</a
        >
      </p>

      @if (printerResource.isLoading()) {
        <p role="status">Loading printer...</p>
      } @else if (printer(); as printer) {
        <h1 class="h2 mb-4">
          QR code &amp; PIN for {{ printer.name }}
        </h1>

        @if (error()) {
          <app-alert variant="danger">{{ error() }}</app-alert>
        }
        <div role="status" aria-live="polite" aria-atomic="true">
          @if (notice()) {
            <app-alert variant="success" [role]="null">{{
              notice()
            }}</app-alert>
          }
        </div>

        <section class="mb-5" aria-labelledby="qr-heading">
          <h2 class="h4" id="qr-heading">QR code</h2>
          <p class="text-muted">
            Anyone with this QR code (or its link) can upload to
            {{ printer.name }} during the window below, without a
            PIN.
          </p>

          <app-qr-window-form
            [windowForm]="windowForm"
            [now]="now()"
            [busy]="busy()"
            [regenerate]="!!issued()"
          />

          @if (issued(); as issued) {
            <app-qr-issued
              [printer]="printer"
              [issued]="issued"
              [qrImage]="qrImage()"
              [busy]="busy()"
              (copyLink)="copyLink(issued)"
              (openPoster)="openPoster(printer, issued)"
              (printPoster)="printPoster(printer, issued)"
            />
          }
        </section>

        <div class="mb-5">
          <app-pin-section
            [printer]="printer"
            [busy]="busy()"
            (refresh)="refreshPin(printer)"
            (disable)="disablePin(printer)"
          />
        </div>

        <app-revoke-section
          [printerName]="printer.name"
          [busy]="busy()"
          (revoke)="revoke(printer)"
        />
      } @else {
        <h1 class="h2">Printer not found</h1>
      }
    </main>
  `,
})
export class PrinterQrComponent {
  readonly #api = inject(PrinterService);
  readonly #document = inject(DOCUMENT);
  readonly #slug =
    inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  protected readonly printerResource = rxResource({
    stream: () => this.#api.getAdminPrinter(this.#slug),
  });
  /** The loaded printer, replaced by each PIN or revoke response. */
  readonly printer = linkedSignal<PrinterSummary | undefined>(() =>
    this.printerResource.hasValue()
      ? this.printerResource.value()
      : undefined,
  );
  readonly issued = signal<IssuedQrToken | undefined>(undefined);
  readonly qrImage = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  /** Captured in the browser so presets use the admin's clock and time zone. */
  readonly now = signal<Date | undefined>(undefined);
  readonly #window = signal<QrWindow>({ notBefore: '', expiresAt: '' });
  readonly windowForm = form(
    this.#window,
    (path) => {
      required(path.notBefore, {
        message: 'Choose when the QR code starts working.',
      });
      required(path.expiresAt, {
        message: 'Choose when the QR code stops working.',
      });
      validate(path.expiresAt, ({ value, valueOf }) => {
        const message = windowOrderError(
          valueOf(path.notBefore),
          value(),
        );
        return message ? { kind: 'window', message } : undefined;
      });
    },
    { submission: { action: () => this.#issue() } },
  );

  constructor() {
    // Wall-clock defaults belong to the browser, not the server render.
    afterNextRender(() => {
      const now = new Date();
      this.now.set(now);
      this.#window.set(defaultWindow(now));
    });
  }

  #issue(): Promise<TreeValidationResult> {
    this.#begin();
    return firstValueFrom(
      this.#api.issueQrToken(this.#slug, toIsoWindow(this.#window())),
    )
      .then((issued) => {
        this.issued.set(issued);
        return qrDataUri(issued.url);
      })
      .then((image) => {
        this.qrImage.set(image);
        this.notice.set('QR code generated.');
      })
      .catch((error: unknown) => {
        this.error.set(apiErrorMessage(error, 'Failed to generate QR'));
      })
      .finally(() => this.busy.set(false))
      .then((): TreeValidationResult => undefined);
  }

  copyLink(issued: IssuedQrToken): void {
    void this.#document.defaultView?.navigator.clipboard
      .writeText(issued.url)
      .then(() => this.notice.set('Link copied to clipboard.'));
  }

  openPoster(printer: PrinterSummary, issued: IssuedQrToken): void {
    const view = this.#document.defaultView;
    // Open the tab during the click so pop-up blockers allow it, then point it at the PDF.
    const tab = view?.open('', '_blank');
    if (!view || !tab) {
      this.error.set(
        'Allow pop-ups for this site to view the QR poster.',
      );
      return;
    }
    tab.opener = null;
    this.#run(
      this.#api.getQrPoster(printer.slug, { token: issued.token }),
      (pdf) => {
        const url = URL.createObjectURL(pdf);
        tab.location.href = url;
        view.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      () => tab.close(),
    );
  }

  printPoster(printer: PrinterSummary, issued: IssuedQrToken): void {
    this.#run(
      this.#api.printQrPoster(printer.slug, { token: issued.token }),
      ({ agentOnline }) =>
        this.notice.set(posterNotice(printer.name, agentOnline)),
    );
  }

  refreshPin(printer: PrinterSummary): void {
    if (printer.pin && !this.#confirm(replacePinPrompt(printer.name))) {
      return;
    }
    this.#run(this.#api.refreshPin(printer.slug), (updated) => {
      this.printer.set(updated);
      this.notice.set(pinRefreshedNotice(printer.name));
    });
  }

  disablePin(printer: PrinterSummary): void {
    if (!this.#confirm(disablePinPrompt(printer.name))) {
      return;
    }
    this.#run(this.#api.disablePin(printer.slug), (updated) => {
      this.printer.set(updated);
      this.notice.set(pinDisabledNotice(printer.name));
    });
  }

  revoke(printer: PrinterSummary): void {
    if (!this.#confirm(revokePrompt(printer.name))) {
      return;
    }
    this.#run(this.#api.revokeQrCodes(printer.slug), (updated) => {
      this.printer.set(updated);
      this.issued.set(undefined);
      this.qrImage.set('');
      this.notice.set(revokedNotice(printer.name));
    });
  }

  #begin(): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
  }

  #run<T>(
    request: Observable<T>,
    next: (value: T) => void,
    failed?: () => void,
  ): void {
    this.#begin();
    void firstValueFrom(request).then(
      (value) => {
        this.busy.set(false);
        next(value);
      },
      (error: unknown) => {
        this.busy.set(false);
        failed?.();
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
