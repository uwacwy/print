import { Component, computed, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';

/** A labelled text input bound to a signal form field, with a hint and its first error once touched. */
@Component({
  selector: 'app-text-field',
  imports: [FormField],
  template: `
    <label class="form-label" [for]="inputId()">{{ label() }}</label>
    <input
      class="form-control"
      [id]="inputId()"
      [formField]="field()"
      [attr.autocomplete]="autocomplete()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [attr.aria-errormessage]="error() ? inputId() + '-error' : null"
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
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();
  readonly field = input.required<FieldTree<string>>();
  readonly hint = input('');
  readonly autocomplete = input('off');

  protected readonly error = computed(() => {
    const state = this.field()();
    return state.touched() ? (state.errors()[0]?.message ?? '') : '';
  });

  protected readonly describedBy = computed(
    () => (this.hint() ? `${this.inputId()}-hint` : null),
  );
}
