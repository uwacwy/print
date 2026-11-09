import { Component, computed, input } from '@angular/core';
import { FormField, FormRoot, type FieldTree } from '@angular/forms/signals';
import { formatPinInput } from '../../helpers/print-pin/print-pin';

export interface PinModel {
  pin: string;
}

/** Asks for the printer PIN, formatting it as ###-###-### while typing. */
@Component({
  selector: 'app-print-pin-form',
  imports: [FormField, FormRoot],
  template: `
    <p class="text-muted">
      Enter the PIN posted at the printer, or scan its QR code.
    </p>
    <form [formRoot]="pinForm()" class="d-flex flex-column gap-3">
      <div>
        <label class="form-label" for="printer-pin">Printer PIN</label>
        <input
          id="printer-pin"
          class="form-control form-control-lg font-monospace"
          [class.is-invalid]="!!error()"
          [formField]="pinForm().pin"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="123-456-789"
          aria-describedby="printer-pin-help"
          [attr.aria-invalid]="!!error()"
          [attr.aria-errormessage]="error() ? 'printer-pin-error' : null"
          (input)="format()"
        />
        <div id="printer-pin-help" class="form-text">9 digits</div>
        @if (error()) {
          <div
            id="printer-pin-error"
            class="invalid-feedback d-block"
            role="alert"
          >
            {{ error() }}
          </div>
        }
      </div>
      <div>
        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="pinForm()().submitting()"
        >
          {{ pinForm()().submitting() ? 'Checking...' : 'Continue' }}
        </button>
      </div>
    </form>
  `,
})
export class PinFormComponent {
  readonly pinForm = input.required<FieldTree<PinModel>>();

  /** The first message once the user has interacted with the field. */
  protected readonly error = computed(() => {
    const state = this.pinForm().pin();
    return state.touched() ? (state.errors()[0]?.message ?? '') : '';
  });

  protected format(): void {
    this.pinForm().pin().value.update(formatPinInput);
  }
}
