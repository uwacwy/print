import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PrinterSummary } from '../../../../services/printer/printer.service';

/** The read-only facts about a printer. */
@Component({
  selector: 'app-printer-details',
  imports: [DatePipe, RouterLink],
  template: `
    <dl class="row small mb-3">
      <dt class="col-sm-3">Upload page</dt>
      <dd class="col-sm-9">
        <a
          [routerLink]="['/print', printer().slug]"
          target="_blank"
          rel="noopener"
        >
          /print/{{ printer().slug }}&nbsp;
          <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
          <span class="visually-hidden">(opens in new tab)</span>
        </a>
      </dd>
      <dt class="col-sm-3">Upload PIN</dt>
      <dd class="col-sm-9">
        @if (printer().pin) {
          <span class="font-monospace">{{ printer().pin }}</span>
        } @else {
          Off (QR code only)
        }
      </dd>
      <dt class="col-sm-3">Destination</dt>
      <dd class="col-sm-9">
        <code>{{ printer().queue }}</code>
      </dd>
      <dt class="col-sm-3">Cover page</dt>
      <dd class="col-sm-9">{{ printer().coverPage ? 'On' : 'Off' }}</dd>
      <dt class="col-sm-3">Agent last seen</dt>
      <dd class="col-sm-9 mb-0">
        {{
          printer().lastSeenAt
            ? (printer().lastSeenAt | date: 'medium')
            : 'Never connected'
        }}
      </dd>
    </dl>
  `,
})
export class PrinterDetailsComponent {
  readonly printer = input.required<PrinterSummary>();
}
