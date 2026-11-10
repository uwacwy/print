import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CreatedPrinter } from '../../../../services/printer/printer.service';

import { SetupCommandsComponent } from '../../../../components/setup-commands/setup-commands.component';
import { createdPrinterCommands } from '../../helpers/created-printer-commands/created-printer-commands';

/** The one-time agent token and setup commands shown after a printer is created. */
@Component({
  imports: [RouterLink, SetupCommandsComponent],
  selector: 'app-created-printer',
  template: `
    <section
      class="border rounded p-3 mb-4"
      aria-labelledby="agent-token-heading"
    >
      <h2
        i18n="@@created-printer.set-up-the-agent"
        class="h5"
        id="agent-token-heading"
      >
        Set up the agent (token shown once)
      </h2>
      <p i18n="@@created-printer.run-one-of-these">
        Run one of these on the computer next to
        {{ created().printer.name }}, or copy the agent token
        into its configuration now. The token is not shown again.
      </p>
      @if (!created().serverUrl) {
        <p
          i18n="@@created-printer.on-the-server-to"
          i18n="@@created-printer.set-public-url-on"
          class="text-body-secondary"
        >
          Set
          <code>PUBLIC_URL</code>
          on the server to get ready-made setup commands.
        </p>
      }
      <app-setup-commands [commands]="commands()" />
    </section>
    <a
      i18n="@@created-printer.done"
      class="btn btn-primary"
      routerLink="/manage"
      >Done</a
    >
  `,
})
export class CreatedPrinterComponent {
  readonly created = input.required<CreatedPrinter>();
  protected readonly commands = computed(() =>
    createdPrinterCommands(this.created()),
  );
}
