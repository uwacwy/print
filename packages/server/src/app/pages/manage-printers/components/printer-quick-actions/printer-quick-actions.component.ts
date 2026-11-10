import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

/** Icon-only shortcuts shown beside a printer's row. */
@Component({
  imports: [RouterLink],
  selector: 'app-printer-quick-actions',
  template: `
    <div
      class="btn-group btn-group-sm"
      role="group"
      [attr.aria-label]="'Quick actions for ' + printer().name"
    >
      <a
        class="btn btn-outline-secondary"
        [routerLink]="['/print', printer().slug]"
        target="_blank"
        rel="noopener"
        title="Open upload page"
      >
        <i
          class="bi bi-box-arrow-up-right"
          aria-hidden="true"
        ></i>
        <span class="visually-hidden"
          >Open upload page for {{ printer().name }} (opens in
          new tab)</span
        >
      </a>
      <button
        type="button"
        class="btn btn-outline-secondary"
        title="Print QR sheet"
        [disabled]="busy()"
        (click)="printQr.emit()"
      >
        <i class="bi bi-printer" aria-hidden="true"></i>
        <span class="visually-hidden"
          >Print QR sheet on {{ printer().name }}</span
        >
      </button>
      <a
        class="btn btn-outline-secondary"
        title="Show QR code"
        [routerLink]="[printer().slug, 'qr']"
      >
        <i class="bi bi-qr-code" aria-hidden="true"></i>
        <span class="visually-hidden"
          >Show QR code for {{ printer().name }}</span
        >
      </a>
    </div>
  `,
})
export class PrinterQuickActionsComponent {
  readonly busy = input(false);
  readonly printer = input.required<PrinterSummary>();
  readonly printQr = output();
}
