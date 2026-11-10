import { Component, computed, input } from '@angular/core';
import {
  type FieldTree,
  FormField,
} from '@angular/forms/signals';

import { fieldError } from '../../helpers/signal-forms/field-error';

/** A labelled text input bound to a signal form field, with a hint and its first error once touched. */
@Component({
  imports: [FormField],
  selector: 'app-text-field',
  template: `
    <label class="form-label" [for]="inputId()">{{
      label()
    }}</label>
    <input
      class="form-control"
      [id]="inputId()"
      [formField]="field()"
      [attr.autocomplete]="autocomplete()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [attr.aria-errormessage]="
        error() ? inputId() + '-error' : null
      "
    />
    @if (hint()) {
      <div class="form-text" [id]="inputId() + '-hint'">
        {{ hint() }}
      </div>
    }
    @if (error()) {
      <div
        class="form-text text-danger"
        [id]="inputId() + '-error'"
        role="alert"
      >
        {{ error() }}
      </div>
    }
  `,
})
export class TextFieldComponent {
  readonly autocomplete = input('off');
  readonly field = input.required<FieldTree<string>>();
  readonly hint = input('');
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();

  protected readonly describedBy = computed(() =>
    this.hint() ? `${this.inputId()}-hint` : null,
  );

  protected readonly error = fieldError(() => this.field());
}
