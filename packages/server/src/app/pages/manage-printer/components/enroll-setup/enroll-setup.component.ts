import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  enrollSetupCommands,
  type EnrollTokenResponse,
} from '@uwacwy/print-shared';

import { SetupCommandsComponent } from '../../../../components/setup-commands/setup-commands.component';

/** Offers a setup command to run on the printer's computer, which enrolls the printer itself. */
@Component({
  imports: [DatePipe, RouterLink, SetupCommandsComponent],
  selector: 'app-enroll-setup',
  template: `
    <section aria-labelledby="enroll-heading">
      <h2
        i18n="@@enroll-setup.set-up-on-the"
        class="h5"
        id="enroll-heading"
      >
        Set up on the printer's computer
      </h2>
      @if (token(); as enroll) {
        <p i18n="@@enroll-setup.run-one-of-these">
          Run one of these on the computer next to the printer,
          such as a Raspberry Pi with CUPS. It asks whether the
          printer is a CUPS queue or a network (IPP) printer,
          lists the printers it finds, and suggests a name and
          slug. The printer appears in the list when setup
          finishes.
        </p>
        <p i18n="@@enroll-setup.works-until-anyone-with">
          Works until {{ enroll.expiresAt | date: 'shortTime' }}.
          Anyone with the command can add a printer until then.
        </p>
        <app-setup-commands [commands]="commands()" />
        <div class="d-flex gap-2 mt-3">
          <a
            i18n="@@enroll-setup.done"
            class="btn btn-primary"
            routerLink="/manage"
            >Done</a
          >
          <button
            i18n="@@enroll-setup.new-command"
            type="button"
            class="btn btn-outline-secondary"
            [disabled]="busy()"
            (click)="create.emit()"
          >
            New command
          </button>
        </div>
      } @else {
        <p i18n="@@enroll-setup.get-a-command-to">
          Get a command to run on the computer connected to the
          printer. It finds the printer, asks for its name, and
          starts the print agent.
        </p>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="busy()"
          (click)="create.emit()"
        >
          @if (busy()) {
            <ng-container i18n="@@enroll-setup.creating"
              >Creating...</ng-container
            >
          } @else {
            <ng-container i18n="@@enroll-setup.create"
              >Create setup command</ng-container
            >
          }
        </button>
      }
    </section>
  `,
})
export class EnrollSetupComponent {
  readonly busy = input(false);
  readonly create = output();
  readonly token = input<EnrollTokenResponse>();

  protected readonly commands = computed(() => {
    const enroll = this.token();
    return enroll
      ? enrollSetupCommands(enroll.serverUrl, enroll.token)
      : [];
  });
}
