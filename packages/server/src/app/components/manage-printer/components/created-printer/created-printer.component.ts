import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CreatedPrinter } from '../../../../services/printer/printer.service';
import { SetupCommandsComponent } from '../../../setup-commands/setup-commands.component';
import { createdPrinterCommands } from '../../helpers/created-printer-commands/created-printer-commands';

/** The one-time agent token and setup commands shown after a printer is created. */
@Component({
  selector: 'app-created-printer',
  imports: [RouterLink, SetupCommandsComponent],
  template: `
    <section
      class="border rounded p-3 mb-4"
      aria-labelledby="agent-token-heading"
    >
      <h2 class="h5" id="agent-token-heading">
        Set up the agent (token shown once)
      </h2>
      <p>
        Run one of these on the computer next to
        {{ created().printer.name }}, or copy the agent token into its
        configuration now. The token is not shown again.
      </p>
      @if (!created().serverUrl) {
        <p class="text-body-secondary">
          Set <code>PUBLIC_URL</code> on the server to get ready-made
          setup commands.
        </p>
      }
      <app-setup-commands [commands]="commands()" />
    </section>
    <a class="btn btn-primary" routerLink="/manage">Done</a>
  `,
})
export class CreatedPrinterComponent {
  readonly created = input.required<CreatedPrinter>();
  protected readonly commands = computed(() =>
    createdPrinterCommands(this.created()),
  );
}
