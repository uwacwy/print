import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

/** The read-only facts about a printer. */
@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-printer-details',
  template: `
    <dl class="row small mb-3">
      <dt i18n="@@printer-details.upload-page" class="col-sm-3">
        Upload page
      </dt>
      <dd class="col-sm-9">
        <a
          i18n="@@printer-details.print-nbsp-i-class"
          [routerLink]="['/print', printer().slug]"
          target="_blank"
          rel="noopener"
        >
          /print/{{ printer().slug }}&nbsp;
          <i
            class="bi bi-box-arrow-up-right"
            aria-hidden="true"
          ></i>
          <span class="visually-hidden">(opens in new tab)</span>
        </a>
      </dd>
      <dt i18n="@@printer-details.upload-pin" class="col-sm-3">
        Upload PIN
      </dt>
      <dd i18n="@@printer-details.pin" class="col-sm-9">
        @if (printer().pin) {
          <span class="font-monospace">{{ printer().pin }}</span>
        } @else {
          Off (QR code only)
        }
      </dd>
      <dt i18n="@@printer-details.destination" class="col-sm-3">
        Destination
      </dt>
      <dd class="col-sm-9">
        <code>{{ printer().queue }}</code>
      </dd>
      <dt i18n="@@printer-details.cover-page" class="col-sm-3">
        Cover page
      </dt>
      <dd class="col-sm-9">
        {{ printer().coverPage ? 'On' : 'Off' }}
      </dd>
      <dt
        i18n="@@printer-details.agent-last-seen"
        class="col-sm-3"
      >
        Agent last seen
      </dt>
      <dd class="col-sm-9 mb-0">
        @if (printer().lastSeenAt) {
          {{ printer().lastSeenAt | date: 'medium' }}
        } @else {
          <ng-container i18n="@@printer-details.never-connected"
            >Never connected</ng-container
          >
        }
      </dd>
    </dl>
  `,
})
export class PrinterDetailsComponent {
  readonly printer = input.required<PrinterSummary>();
}
