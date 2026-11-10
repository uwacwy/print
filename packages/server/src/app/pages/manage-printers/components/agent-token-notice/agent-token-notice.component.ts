import type { SetupCommand } from '@uwacwy/print-shared';

import {
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { SetupCommandsComponent } from '../../../../components/setup-commands/setup-commands.component';

/** A freshly rotated agent token, shown once with a copy button. */
@Component({
  imports: [SetupCommandsComponent],
  selector: 'app-agent-token-notice',
  template: `
    <section
      class="alert alert-warning"
      [attr.aria-labelledby]="'token-heading-' + printerId()"
    >
      <h2
        i18n="@@agent-token-notice.new-agent-token-shown"
        class="h6"
        [id]="'token-heading-' + printerId()"
      >
        New agent token (shown once)
      </h2>
      <p
        i18n="@@agent-token-notice.and-this-token-button"
        i18n="@@agent-token-notice.the-previous-token-no"
        class="small mb-2"
      >
        The previous token no longer works. Reconfigure the agent
        with server URL <code>{{ serverUrl() }}</code> and this
        token:
      </p>
      <app-setup-commands [commands]="commands()" />
      <button
        i18n="@@agent-token-notice.done"
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
  readonly dismissed = output();
  readonly printerId = input.required<number>();
  readonly serverUrl = input('');
  readonly token = input.required<string>();

  protected readonly commands = computed((): SetupCommand[] => [
    {
      command: this.token(),
      id: 'token',
      label: $localize`:@@setup-command.agent-token:Agent token`,
    },
  ]);
}
