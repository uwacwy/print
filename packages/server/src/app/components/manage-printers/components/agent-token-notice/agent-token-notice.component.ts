import { Component, computed, input, output } from '@angular/core';
import type { SetupCommand } from '@uwacwy/print-shared';
import { SetupCommandsComponent } from '../../../setup-commands/setup-commands.component';

/** A freshly rotated agent token, shown once with a copy button. */
@Component({
  selector: 'app-agent-token-notice',
  imports: [SetupCommandsComponent],
  template: `
    <section
      class="alert alert-warning"
      [attr.aria-labelledby]="'token-heading-' + printerId()"
    >
      <h2 class="h6" [id]="'token-heading-' + printerId()">
        New agent token (shown once)
      </h2>
      <p class="small mb-2">
        The previous token no longer works. Reconfigure the agent with
        server URL <code>{{ serverUrl() }}</code> and this token:
      </p>
      <app-setup-commands [commands]="commands()" />
      <button
        type="button"
        class="btn btn-sm btn-outline-dark mt-2"
        (click)="dismissed.emit()"
      >
        Done
      </button>
    </section>
  `,
})
export class AgentTokenNoticeComponent {
  readonly printerId = input.required<number>();
  readonly token = input.required<string>();
  readonly serverUrl = input('');
  readonly dismissed = output();

  protected readonly commands = computed((): SetupCommand[] => [
    { id: 'token', label: 'Agent token', command: this.token() },
  ]);
}
