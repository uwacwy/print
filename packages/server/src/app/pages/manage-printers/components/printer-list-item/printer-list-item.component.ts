import { Component, input, output } from '@angular/core';

import type { PrinterSummary } from '../../../../services/printer/printer.service';

import { AgentBadgeComponent } from '../../../../components/agent-badge/agent-badge.component';
import { AgentTokenNoticeComponent } from '../agent-token-notice/agent-token-notice.component';
import { PrinterAdminActionsComponent } from '../printer-admin-actions/printer-admin-actions.component';
import { PrinterDetailsComponent } from '../printer-details/printer-details.component';
import { PrinterQuickActionsComponent } from '../printer-quick-actions/printer-quick-actions.component';

/** One printer: an expandable summary with details and management actions, plus quick actions. */
@Component({
  host: {
    '[attr.data-printer-id]': 'printer().id',
    class: 'printer d-flex align-items-start border rounded',
  },
  imports: [
    AgentBadgeComponent,
    AgentTokenNoticeComponent,
    PrinterAdminActionsComponent,
    PrinterDetailsComponent,
    PrinterQuickActionsComponent,
  ],
  selector: 'li[app-printer-list-item]',
  styles: `
    .printer-details {
      flex: 1 1 auto;
      min-width: 0;
    }
    .printer-summary {
      padding: 0.75rem 1rem;
    }
    .printer-actions {
      display: block;
      flex-shrink: 0;
      margin: 0.5rem 0.75rem 0 0;
    }
  `,
  template: `
    <details class="printer-details">
      <summary class="printer-summary">
        <span class="fw-semibold me-1">{{
          printer().name
        }}</span>
        <app-agent-badge [online]="printer().online" />
        <span class="text-muted small ms-1">
          {{ printer().activeJobs }} active
          {{ printer().activeJobs === 1 ? 'job' : 'jobs' }}
        </span>
        @if (printer().failedJobs) {
          <span class="badge text-bg-danger ms-1">
            {{ printer().failedJobs }} failed
          </span>
        }
      </summary>

      <div class="px-3 pb-3">
        <app-printer-details [printer]="printer()" />
        @if (token(); as token) {
          <app-agent-token-notice
            [printerId]="printer().id"
            [token]="token"
            [serverUrl]="serverUrl()"
            (dismissed)="dismissToken.emit()"
          />
        }
        <app-printer-admin-actions
          [printer]="printer()"
          [busy]="busy()"
          (rotateToken)="rotateToken.emit()"
          (retryFailedJobs)="retryFailedJobs.emit()"
          (deleteAllJobs)="deleteAllJobs.emit()"
          (removePrinter)="removePrinter.emit()"
        />
      </div>
    </details>

    <app-printer-quick-actions
      class="printer-actions"
      [printer]="printer()"
      [busy]="busy()"
      (printQr)="printQr.emit()"
    />
  `,
})
export class PrinterListItemComponent {
  readonly busy = input(false);
  readonly deleteAllJobs = output();
  readonly dismissToken = output();
  readonly printer = input.required<PrinterSummary>();
  readonly printQr = output();
  readonly removePrinter = output();
  readonly retryFailedJobs = output();
  readonly rotateToken = output();
  readonly serverUrl = input('');
  /** A just-rotated agent token, if one is waiting to be copied. */
  readonly token = input<string>();
}
