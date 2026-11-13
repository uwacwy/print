import { Component, input, model } from '@angular/core';

export type AddMode = 'enroll' | 'manual';

/** Chooses between enrolling from the printer's computer and typing the details here. */
@Component({
  selector: 'app-add-mode-choice',
  template: `
    <fieldset class="mb-4">
      <legend i18n="@@HowDoYouWantToAddThePrinter" class="h6">
        How do you want to add the printer?
      </legend>
      <div class="form-check">
        <input
          class="form-check-input"
          type="radio"
          name="add-mode"
          id="add-mode-enroll"
          value="enroll"
          aria-describedby="add-mode-enroll-help"
          [checked]="mode() === 'enroll'"
          [disabled]="!enrollment()"
          (change)="mode.set('enroll')"
        />
        <label
          i18n="@@SetUpOnThePrintersComputer"
          class="form-check-label"
          for="add-mode-enroll"
          >Set up on the printer's computer</label
        >
        <div class="form-text" id="add-mode-enroll-help">
          @if (enrollment()) {
            <span i18n="@@Recommended">Recommended.</span>
            <span
              i18n="
                @@RunInteractiveSetupOnTheAgentConnectedToThePrinter"
            >
              Run interactive setup on the agent connected to the
              printer.
            </span>
          } @else {
            <ng-container i18n="@@Unavailable">
              Unavailable: set <code>SITE_URL</code> on the
              server to enable it.
            </ng-container>
          }
        </div>
      </div>
      <div class="form-check">
        <input
          class="form-check-input"
          type="radio"
          name="add-mode"
          id="add-mode-manual"
          value="manual"
          aria-describedby="add-mode-manual-help"
          [checked]="mode() === 'manual'"
          (change)="mode.set('manual')"
        />
        <label
          i18n="@@EnterThePrintersDetailsHere"
          class="form-check-label"
          for="add-mode-manual"
          >Enter the printer's details here</label
        >
        <div
          i18n="
            @@ThenCopyTheAgentsSettingsToItsComputerOrADockerComposeFile"
          class="form-text"
          id="add-mode-manual-help"
        >
          Then copy the agent's settings to its computer or a
          Docker Compose file.
        </div>
      </div>
    </fieldset>
  `,
})
export class AddModeChoiceComponent {
  /** The server has `SITE_URL`, so printers can enroll from their own computers. */
  readonly enrollment = input.required<boolean>();
  readonly mode = model.required<AddMode>();
}
