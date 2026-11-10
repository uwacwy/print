import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type {
  IssuedQrToken,
  PrinterSummary,
} from '../../../../services/printer/printer.service';

/** An issued QR code with its link and poster actions. */
@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-qr-issued',
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
    <div class="d-flex flex-wrap gap-4 align-items-start">
      @if (qrImage()) {
        <img
          class="qr-image border rounded"
          [src]="qrImage()"
          [alt]="
            'QR code linking to the print page for ' +
            printer().name
          "
        />
      }
      <div class="qr-details flex-grow-1">
        <p class="mb-2">
          Valid {{ issued().notBefore | date: 'medium' }} to
          {{ issued().expiresAt | date: 'medium' }}
        </p>
        <p class="mb-2">
          <a
            class="print-link"
            [routerLink]="['/print', printer().slug]"
            [queryParams]="{ token: issued().token }"
            target="_blank"
            rel="noopener"
          >
            Open print page
            <i
              class="bi bi-box-arrow-up-right"
              aria-hidden="true"
            ></i>
            <span class="visually-hidden"
              >(opens in new tab)</span
            >
          </a>
        </p>
        <code
          class="d-block small text-break user-select-all mb-3"
          >{{ issued().url }}</code
        >
        <div class="d-flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            (click)="copyLink.emit()"
          >
            <i class="bi bi-clipboard" aria-hidden="true"></i>
            Copy link
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            [disabled]="busy()"
            (click)="openPoster.emit()"
          >
            <i
              class="bi bi-file-earmark-pdf"
              aria-hidden="true"
            ></i>
            Open poster PDF
            <span class="visually-hidden"
              >(opens in new tab)</span
            >
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            [disabled]="busy()"
            (click)="printPoster.emit()"
          >
            <i class="bi bi-printer" aria-hidden="true"></i>
            Print poster on {{ printer().name }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class QrIssuedComponent {
  readonly busy = input(false);
  readonly copyLink = output();
  readonly issued = input.required<IssuedQrToken>();
  readonly openPoster = output();
  readonly printer = input.required<PrinterSummary>();
  readonly printPoster = output();
  /** Data URI of the QR image; empty while it is still being drawn. */
  readonly qrImage = input('');
}
