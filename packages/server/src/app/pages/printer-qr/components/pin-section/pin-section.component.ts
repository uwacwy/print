import { Component, input, output } from '@angular/core';
import { type PrinterSummary } from '@uwacwy/print-shared';

/** The printer's upload PIN, with turn on/refresh/off controls. */
@Component({
  selector: 'app-pin-section',
  template: `
    <section aria-labelledby="pin-heading">
      <h2
        i18n="@@pin-section.upload-pin"
        class="h4"
        id="pin-heading"
      >
        Upload PIN
      </h2>
      @if (printer().pin; as pin) {
        <p i18n="@@pin-section.visitors-without-the-qr">
          Visitors without the QR code can enter this PIN to get
          a short-lived upload link:
          <strong class="pin font-monospace fs-4 ms-2">{{
            pin
          }}</strong>
        </p>
      } @else {
        <p
          i18n="@@pin-section.pin-uploads-are-off"
          class="text-muted"
        >
          PIN uploads are off. Only QR codes work for this
          printer.
        </p>
      }
      <div class="d-flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-outline-primary"
          [disabled]="busy()"
          (click)="refresh.emit()"
        >
          <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
          @if (printer().pin) {
            <ng-container i18n="@@pin-section.refresh"
              >Refresh PIN</ng-container
            >
          } @else {
            <ng-container i18n="@@pin-section.turn-on"
              >Turn on PIN</ng-container
            >
          }
        </button>
        @if (printer().pin) {
          <button
            i18n="@@pin-section.turn-off-pin"
            type="button"
            class="btn btn-outline-danger"
            [disabled]="busy()"
            (click)="disable.emit()"
          >
            Turn off PIN
          </button>
        }
      </div>
    </section>
  `,
})
export class PinSectionComponent {
  readonly busy = input(false);
  readonly disable = output();
  readonly printer = input.required<PrinterSummary>();
  readonly refresh = output();
}
