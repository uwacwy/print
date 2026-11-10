import { Component, input } from '@angular/core';

/** Online/Offline badge for a printer's agent. */
@Component({
  selector: 'app-agent-badge',
  template: `
    @if (online()) {
      <span
        i18n="@@agent-badge.online"
        class="badge text-bg-success"
        >Online</span
      >
    } @else {
      <span
        i18n="@@agent-badge.offline"
        class="badge text-bg-secondary"
        >Offline</span
      >
    }
  `,
})
export class AgentBadgeComponent {
  readonly online = input.required<boolean>();
}
