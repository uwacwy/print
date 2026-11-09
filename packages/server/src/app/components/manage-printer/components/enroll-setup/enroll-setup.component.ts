import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  enrollSetupCommands,
  type EnrollTokenResponse,
} from '@uwacwy/print-shared';
import { SetupCommandsComponent } from '../../../setup-commands/setup-commands.component';

/** Offers a setup command to run on the printer's computer, which enrolls the printer itself. */
@Component({
  selector: 'app-enroll-setup',
  imports: [DatePipe, RouterLink, SetupCommandsComponent],
  template: `
    <section aria-labelledby="enroll-heading">
      <h2 class="h5" id="enroll-heading">
        Set up on the printer's computer
      </h2>
      @if (token(); as enroll) {
        <p>
          Run one of these on the computer next to the printer, such
          as a Raspberry Pi with CUPS. It asks whether the printer is
          a CUPS queue or a network (IPP) printer, lists the printers
          it finds, and suggests a name and slug. The printer appears
          in the list when setup finishes.
        </p>
        <p>
          Works until {{ enroll.expiresAt | date: 'shortTime' }}.
          Anyone with the command can add a printer until then.
        </p>
        <app-setup-commands [commands]="commands()" />
        <div class="d-flex gap-2 mt-3">
          <a class="btn btn-primary" routerLink="/manage">Done</a>
          <button
            type="button"
            class="btn btn-outline-secondary"
            [disabled]="busy()"
            (click)="create.emit()"
          >
            New command
          </button>
        </div>
      } @else {
        <p>
          Get a command to run on the computer connected to the
          printer. It finds the printer, asks for its name, and starts
          the print agent.
        </p>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="busy()"
          (click)="create.emit()"
        >
          {{ busy() ? 'Creating...' : 'Create setup command' }}
        </button>
      }
    </section>
  `,
})
export class EnrollSetupComponent {
  readonly token = input<EnrollTokenResponse>();
  readonly busy = input(false);
  readonly create = output();

  protected readonly commands = computed(() => {
    const enroll = this.token();
    return enroll
      ? enrollSetupCommands(enroll.serverUrl, enroll.token)
      : [];
  });
}
