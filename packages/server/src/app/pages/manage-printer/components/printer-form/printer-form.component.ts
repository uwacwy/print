import {
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type FieldTree,
  FormField,
  FormRoot,
} from '@angular/forms/signals';

import { TextFieldComponent } from '../../../../components/text-field/text-field.component';
import { type PrinterModel } from '../../helpers/printer-form/printer-form';
import { DeleteConfirmationComponent } from '../delete-confirmation/delete-confirmation.component';

/** The printer's editable fields with save and, for existing printers, delete. */
@Component({
  imports: [
    FormField,
    FormRoot,
    TextFieldComponent,
    DeleteConfirmationComponent,
  ],
  selector: 'app-printer-form',
  template: `
    <form
      [formRoot]="printerForm()"
      class="d-flex flex-column gap-3"
    >
      <div>
        <app-text-field
          inputId="printer-name"
          label="Display name"
          [field]="printerForm().name"
        />
      </div>
      <div>
        <app-text-field
          inputId="printer-slug"
          label="Upload slug"
          [field]="printerForm().slug"
          [hint]="
            'Public upload URL: /print/' + (slug() || 'slug')
          "
        />
      </div>
      <div>
        <app-text-field
          inputId="printer-queue"
          label="Printer destination"
          [field]="printerForm().queue"
          hint="Use cups://Queue_Name or an ipp:// printer endpoint."
        />
      </div>
      <label class="form-check">
        <input
          id="printer-cover-page"
          class="form-check-input"
          type="checkbox"
          [formField]="printerForm().coverPage"
        />
        <span class="form-check-label"
          >Print a privacy cover page</span
        >
      </label>
      <div class="d-flex gap-2">
        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="saving()"
        >
          {{
            saving()
              ? 'Saving...'
              : isNew()
                ? 'Create printer'
                : 'Save changes'
          }}
        </button>
        @if (!isNew()) {
          <button
            class="btn btn-outline-danger"
            type="button"
            (click)="confirmingDelete.set(true)"
          >
            Delete printer
          </button>
        }
      </div>
    </form>

    @if (confirmingDelete()) {
      <app-delete-confirmation
        (confirmed)="remove.emit()"
        (cancelled)="confirmingDelete.set(false)"
      />
    }
  `,
})
export class PrinterFormComponent {
  readonly isNew = input.required<boolean>();
  readonly printerForm =
    input.required<FieldTree<PrinterModel>>();
  readonly remove = output();
  readonly saving = input(false);

  protected readonly confirmingDelete = signal(false);
  protected readonly slug = computed(() =>
    this.printerForm().slug().value(),
  );
}
