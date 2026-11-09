import { Component, input } from '@angular/core';

import { AgentBadgeComponent } from '../../../../components/agent-badge/agent-badge.component';

/** Whether the printer's agent is connected, and how many jobs are waiting. */
@Component({
  selector: 'app-printer-status',
  imports: [AgentBadgeComponent],
  template: `
    <p role="status">
      Agent:
      <app-agent-badge [online]="online()" />
      <span class="text-muted ms-2"
        >{{ activeJobs() }} active job(s)</span
      >
    </p>
  `,
})
export class PrinterStatusComponent {
  readonly online = input.required<boolean>();
  readonly activeJobs = input.required<number>();
}
