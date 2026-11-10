import { Component, input, output } from '@angular/core';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

/** The printer's upload PIN, with turn on/refresh/off controls. */
@Component({
  selector: 'app-pin-section',
  template: `
    <section aria-labelledby="pin-heading">
      <h2 class="h4" id="pin-heading">Upload PIN</h2>
      @if (printer().pin; as pin) {
        <p>
          Visitors without the QR code can enter this PIN to get
          a short-lived upload link:
          <strong class="pin font-monospace fs-4 ms-2">{{
            pin
          }}</strong>
        </p>
      } @else {
        <p class="text-muted">
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
          {{ printer().pin ? 'Refresh PIN' : 'Turn on PIN' }}
        </button>
        @if (printer().pin) {
          <button
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
