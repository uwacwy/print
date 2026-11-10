import {
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  type FieldTree,
  FormField,
} from '@angular/forms/signals';

import { FileInput } from '../../../../components/file-input/file-input.component';
import {
  ACCEPTED_TYPES,
  type DocumentRow,
} from '../../helpers/print-upload/print-upload';

/** One document's file picker, copy count and remove button. */
@Component({
  imports: [FormField, FileInput],
  selector: 'app-upload-document-row',
  template: `
    <div class="row g-2 align-items-end mb-3">
      <div class="col-sm-7">
        <label
          i18n="@@upload-document-row.document"
          class="form-label"
          [for]="'document-file-' + id()"
        >
          Document {{ index() + 1 }}
        </label>
        <input
          class="form-control"
          type="file"
          [id]="'document-file-' + id()"
          [accept]="acceptedTypes"
          [class.is-invalid]="!!fileError()"
          [attr.aria-invalid]="!!fileError()"
          [attr.aria-errormessage]="
            fileError() ? 'document-file-error-' + id() : null
          "
          [formField]="document().file"
        />
      </div>
      <div class="col-6 col-sm-3">
        <label
          i18n="@@upload-document-row.copies"
          class="form-label"
          [for]="'document-copies-' + id()"
          >Copies</label
        >
        <select
          class="form-select"
          [id]="'document-copies-' + id()"
          [formField]="document().copies"
        >
          @for (count of copyOptions(); track count) {
            <option [value]="count">{{ count }}</option>
          }
        </select>
      </div>
      <div class="col-6 col-sm-2">
        <button
          i18n="@@upload-document-row.remove"
          type="button"
          class="btn btn-outline-secondary w-100"
          [disabled]="!canRemove()"
          [attr.aria-label]="'Remove document ' + (index() + 1)"
          (click)="remove.emit(id())"
        >
          Remove
        </button>
      </div>
      @if (fileError()) {
        <div
          class="col-12 invalid-feedback d-block mt-1"
          [id]="'document-file-error-' + id()"
          role="alert"
        >
          {{ fileError() }}
        </div>
      }
    </div>
  `,
})
export class UploadDocumentRowComponent {
  readonly canRemove = input(true);
  readonly copyOptions = input<readonly string[]>(['1']);
  readonly document = input.required<FieldTree<DocumentRow>>();
  readonly index = input.required<number>();
  /** Emits the row's id. */
  readonly remove = output<number>();

  protected readonly acceptedTypes = ACCEPTED_TYPES;
  protected readonly fileError = computed(() => {
    const state = this.document().file();
    return state.touched()
      ? (state.errors()[0]?.message ?? '')
      : '';
  });
  protected readonly id = computed(() =>
    this.document().id().value(),
  );
}
