import { Component, input } from '@angular/core';

import { AgentBadgeComponent } from '../../../../components/agent-badge/agent-badge.component';

/** Whether the printer's agent is connected, and how many jobs are waiting. */
@Component({
  imports: [AgentBadgeComponent],
  selector: 'app-printer-status',
  template: `
    <p
      i18n="@@printer-status.agent-span-i18n-printer"
      role="status"
    >
      Agent:
      <app-agent-badge [online]="online()" />
      <span class="text-muted ms-2"
        >{{ activeJobs() }} active job(s)</span
      >
    </p>
  `,
})
export class PrinterStatusComponent {
  readonly activeJobs = input.required<number>();
  readonly online = input.required<boolean>();
}
