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
          i18n-label="@@printer-form.display-name.label"
          [field]="printerForm().name"
        />
      </div>
      <div>
        <app-text-field
          inputId="printer-slug"
          label="Upload slug"
          i18n-label="@@printer-form.upload-slug.label"
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
          i18n-label="@@printer-form.printer-destination.label"
          [field]="printerForm().queue"
          hint="Use cups://Queue_Name or an ipp:// printer endpoint."
          i18n-hint="@@printer-form.use-cups-queue.hint"
        />
      </div>
      <label class="form-check">
        <input
          id="printer-cover-page"
          class="form-check-input"
          type="checkbox"
          [formField]="printerForm().coverPage"
        />
        <span
          i18n="@@printer-form.print-a-privacy-cover"
          class="form-check-label"
          >Print a privacy cover page</span
        >
      </label>
      <div class="d-flex gap-2">
        <button
          class="btn btn-primary"
          type="submit"
          [disabled]="saving()"
        >
          @if (saving()) {
            <ng-container i18n="@@printer-form.saving"
              >Saving...</ng-container
            >
          } @else if (isNew()) {
            <ng-container i18n="@@printer-form.create"
              >Create printer</ng-container
            >
          } @else {
            <ng-container i18n="@@printer-form.save"
              >Save changes</ng-container
            >
          }
        </button>
        @if (!isNew()) {
          <button
            i18n="@@printer-form.delete-printer"
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
