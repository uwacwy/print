import { Component, input, output } from '@angular/core';
import {
  type FieldTree,
  FormField,
  FormRoot,
} from '@angular/forms/signals';

import type { UploadModel } from '../../helpers/print-upload/print-upload';

import { UploadDocumentRowComponent } from '../upload-document-row/upload-document-row.component';

/** The job title and document rows; the page owns the model and submission. */
@Component({
  imports: [FormField, FormRoot, UploadDocumentRowComponent],
  selector: 'app-upload-form',
  template: `
    <form
      [formRoot]="uploadForm()"
      class="d-flex flex-column gap-3"
    >
      <div>
        <label
          i18n="@@upload-form.job-title-reference"
          class="form-label"
          for="job-title"
          >Job Title/Reference</label
        >
        <input
          id="job-title"
          class="form-control"
          [formField]="uploadForm().title"
        />
      </div>

      <fieldset class="border rounded p-3">
        <legend
          i18n="@@upload-form.documents"
          class="float-none w-auto px-2 fs-6 mb-0"
        >
          Documents
        </legend>
        <p
          i18n="@@upload-form.upload-pdf-jpeg-png"
          class="text-muted"
        >
          Upload PDF, JPEG, PNG, or HEIC/HEIF documents; up to
          {{ maxUploadMb() }} MB per document.
        </p>
        @for (
          document of uploadForm().documents;
          track document;
          let index = $index
        ) {
          <app-upload-document-row
            [document]="document"
            [index]="index"
            [copyOptions]="copyOptions()"
            [canRemove]="uploadForm().documents.length > 1"
            (remove)="removeDocument.emit($event)"
          />
        }
        <button
          i18n="@@upload-form.add-another-document"
          type="button"
          class="btn btn-outline-primary"
          [disabled]="
            uploadForm().documents.length >= maxDocuments()
          "
          (click)="addDocument.emit()"
        >
          Add another document
        </button>
      </fieldset>

      <div>
        <button
          class="btn btn-primary btn-lg"
          type="submit"
          [disabled]="uploadForm()().submitting()"
        >
          {{
            uploadForm()().submitting() ? 'Sending...' : 'Print'
          }}
        </button>
      </div>
    </form>
  `,
})
export class UploadFormComponent {
  readonly addDocument = output();
  readonly copyOptions = input<readonly string[]>(['1']);
  readonly maxDocuments = input.required<number>();
  readonly maxUploadMb = input.required<number>();
  /** Emits the id of the row to drop. */
  readonly removeDocument = output<number>();
  readonly uploadForm = input.required<FieldTree<UploadModel>>();
}
