import { Component, computed, input } from '@angular/core';
import { FormRoot, type FieldTree } from '@angular/forms/signals';
import {
  presetsForWindow,
  type QrWindow,
} from '../../helpers/qr-window/qr-window';
import { DatetimeNudgeFieldComponent } from '../datetime-nudge-field/datetime-nudge-field.component';
import { UntilPresetsComponent } from '../until-presets/until-presets.component';

/** Chooses when a QR code starts and stops working. */
@Component({
  selector: 'app-qr-window-form',
  imports: [FormRoot, DatetimeNudgeFieldComponent, UntilPresetsComponent],
  template: `
    <form
      [formRoot]="windowForm()"
      class="row g-3 align-items-start mb-4"
    >
      <div class="col-lg-6">
        <app-datetime-nudge-field
          inputId="qr-not-before"
          label="Valid from"
          context="valid from"
          [field]="windowForm().notBefore"
        />
      </div>
      <div class="col-lg-6">
        <app-datetime-nudge-field
          inputId="qr-expires-at"
          label="Valid until"
          context="valid until"
          [field]="windowForm().expiresAt"
        />
      </div>
      <div class="col-12">
        <app-until-presets
          [presets]="presets()"
          [value]="windowForm().expiresAt().value()"
          (picked)="windowForm().expiresAt().value.set($event)"
        />
      </div>
      <div class="col-12">
        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="busy()"
        >
          {{ regenerate() ? 'Regenerate' : 'Generate' }}
        </button>
      </div>
    </form>
  `,
})
export class QrWindowFormComponent {
  readonly windowForm = input.required<FieldTree<QrWindow>>();
  /** The browser's current time; undefined during server rendering, which hides the presets. */
  readonly now = input<Date>();
  readonly busy = input(false);
  /** A QR code already exists, so submitting replaces it. */
  readonly regenerate = input(false);

  protected readonly presets = computed(() => {
    const now = this.now();
    return now
      ? presetsForWindow(now, this.windowForm().notBefore().value())
      : [];
  });
}
