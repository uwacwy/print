import { Component, input } from '@angular/core';
import {
  type FieldTree,
  FormField,
} from '@angular/forms/signals';

import { fieldError } from '../../../../helpers/signal-forms/field-error';
import {
  NUDGE_MINUTES,
  shiftLocalInput,
} from '../../helpers/qr-window/qr-window';

/** A datetime-local input with buttons that shift it by 15 minutes, and its first error once touched. */
@Component({
  imports: [FormField],
  selector: 'app-datetime-nudge-field',
  template: `
    <label class="form-label" [for]="inputId()">{{
      label()
    }}</label>
    <div class="input-group">
      <input
        class="form-control"
        type="datetime-local"
        [id]="inputId()"
        [class.is-invalid]="!!error()"
        [attr.aria-errormessage]="
          error() ? inputId() + '-error' : null
        "
        [formField]="field()"
      />
      <button
        i18n="@@datetime-nudge-field.15-min-button"
        type="button"
        class="btn btn-outline-secondary"
        (click)="nudge(-minutes)"
      >
        −15 min<span class="visually-hidden">
          ({{ context() }})</span
        >
      </button>
      <button
        i18n="@@datetime-nudge-field.15-min-if-er"
        type="button"
        class="btn btn-outline-secondary"
        (click)="nudge(minutes)"
      >
        +15 min<span class="visually-hidden">
          ({{ context() }})</span
        >
      </button>
    </div>
    @if (error(); as message) {
      <div
        [id]="inputId() + '-error'"
        class="invalid-feedback d-block"
        role="alert"
      >
        {{ message }}
      </div>
    }
  `,
})
export class DatetimeNudgeFieldComponent {
  /** Distinguishes the nudge buttons for screen readers, e.g. "valid from". */
  readonly context = input.required<string>();
  readonly field = input.required<FieldTree<string>>();
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();

  protected readonly error = fieldError(() => this.field());
  protected readonly minutes = NUDGE_MINUTES;

  protected nudge(minutes: number): void {
    const state = this.field()();
    const shifted = shiftLocalInput(state.value(), minutes);
    if (shifted !== undefined) {
      state.value.set(shifted);
      state.markAsTouched();
    }
  }
}
