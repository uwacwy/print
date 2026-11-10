import { Component, model } from '@angular/core';

import { FileControl } from '../file-control/file-control';

/** Binds a single-file `<input type="file">` to a signal form field. */
@Component({
  // Enhances native file inputs, so the selector matches the element itself.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'input[type=file]:not([multiple])',
  template: ``,
})
export class FileInput extends FileControl<File | null> {
  readonly value = model<File | null>(null);

  protected override fromFiles(files: FileList | null) {
    return files?.[0] ?? null;
  }

  protected override isEmpty(value: File | null) {
    return value === null;
  }
}
