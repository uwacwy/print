import { Component, input, output } from '@angular/core';
import type { UntilPreset } from '../../helpers/qr-window/qr-window';

/** A toggle button group of preset end times. */
@Component({
  selector: 'app-until-presets',
  template: `
    @if (presets().length) {
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span id="qr-until-presets" class="fw-semibold">Until:</span>
        <div
          class="d-flex flex-wrap gap-2"
          role="group"
          aria-labelledby="qr-until-presets"
        >
          @for (preset of presets(); track preset.value) {
            @let selected = preset.value === value();
            <button
              type="button"
              class="btn btn-sm"
              [class.btn-secondary]="selected"
              [class.btn-outline-secondary]="!selected"
              [attr.aria-pressed]="selected"
              (click)="picked.emit(preset.value)"
            >
              {{ preset.label }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class UntilPresetsComponent {
  readonly presets = input.required<readonly UntilPreset[]>();
  /** The currently chosen datetime-local value. */
  readonly value = input('');
  readonly picked = output<string>();
}
