import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PrinterSummary } from '../../../../services/printer/printer.service';

/** Management actions in a printer's expanded panel. */
@Component({
  selector: 'app-printer-admin-actions',
  imports: [RouterLink],
  template: `
    <div class="d-flex flex-wrap gap-2">
      <a
        class="btn btn-sm btn-outline-primary"
        [routerLink]="[printer().slug]"
      >
        <i class="bi bi-gear" aria-hidden="true"></i>
        Configure
      </a>
      <a
        class="btn btn-sm btn-outline-primary"
        [routerLink]="[printer().slug, 'qr']"
      >
        <i class="bi bi-qr-code" aria-hidden="true"></i>
        QR code &amp; PIN
      </a>
      <button
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
          type="button"
          class="btn btn-sm btn-outline-primary"
          [disabled]="busy()"
          (click)="retryFailedJobs.emit()"
        >
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
          Retry failed jobs
        </button>
      }
      <button
        type="button"
        class="btn btn-sm btn-outline-danger"
        [disabled]="busy()"
        (click)="deleteAllJobs.emit()"
      >
        <i class="bi bi-trash3" aria-hidden="true"></i>
        Delete all jobs
      </button>
      <button
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
  readonly printer = input.required<PrinterSummary>();
  readonly busy = input(false);
  readonly rotateToken = output();
  readonly retryFailedJobs = output();
  readonly deleteAllJobs = output();
  readonly removePrinter = output();
}
