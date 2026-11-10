import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

/** Management actions in a printer's expanded panel. */
@Component({
  imports: [RouterLink],
  selector: 'app-printer-admin-actions',
  template: `
    <div class="d-flex flex-wrap gap-2">
      <a
        i18n="@@printer-admin-actions.configure-a-class-btn"
        class="btn btn-sm btn-outline-primary"
        [routerLink]="[printer().slug]"
      >
        <i class="bi bi-gear" aria-hidden="true"></i>
        Configure
      </a>
      <a
        i18n="@@printer-admin-actions.qr-code-amp-pin"
        class="btn btn-sm btn-outline-primary"
        [routerLink]="[printer().slug, 'qr']"
      >
        <i class="bi bi-qr-code" aria-hidden="true"></i>
        QR code &amp; PIN
      </a>
      <button
        i18n="@@printer-admin-actions.rotate-token-if-printer"
        type="button"
        class="btn btn-sm btn-outline-warning"
        [disabled]="busy()"
        (click)="rotateToken.emit()"
      >
        <i class="bi bi-key" aria-hidden="true"></i>
        Rotate token
      </button>
      @if (printer().failedJobs) {
        <button
          i18n="@@printer-admin-actions.retry-failed-jobs-button"
          type="button"
          class="btn btn-sm btn-outline-primary"
          [disabled]="busy()"
          (click)="retryFailedJobs.emit()"
        >
          <i
            class="bi bi-arrow-clockwise"
            aria-hidden="true"
          ></i>
          Retry failed jobs
        </button>
      }
      <button
        i18n="@@printer-admin-actions.delete-all-jobs-button"
        type="button"
        class="btn btn-sm btn-outline-danger"
        [disabled]="busy()"
        (click)="deleteAllJobs.emit()"
      >
        <i class="bi bi-trash3" aria-hidden="true"></i>
        Delete all jobs
      </button>
      <button
        i18n="
          @@printer-admin-actions.remove-printer-export-class"
        type="button"
        class="btn btn-sm btn-danger"
        [disabled]="busy()"
        (click)="removePrinter.emit()"
      >
        <i class="bi bi-x-octagon" aria-hidden="true"></i>
        Remove printer
      </button>
    </div>
  `,
})
export class PrinterAdminActionsComponent {
  readonly busy = input(false);
  readonly deleteAllJobs = output();
  readonly printer = input.required<PrinterSummary>();
  readonly removePrinter = output();
  readonly retryFailedJobs = output();
  readonly rotateToken = output();
}
