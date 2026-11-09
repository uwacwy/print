import { Component, input } from '@angular/core';

/** Whether the printer's agent is connected, and how many jobs are waiting. */
@Component({
  selector: 'app-printer-status',
  template: `
    <p role="status">
      Agent:
      @if (online()) {
        <span class="badge text-bg-success">Online</span>
      } @else {
        <span class="badge text-bg-secondary">Offline</span>
      }
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
