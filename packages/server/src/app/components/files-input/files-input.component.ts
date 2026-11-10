import { Component, model } from '@angular/core';

import { FileControl } from '../file-control/file-control';

/**
 * Binds a `<input type="file" multiple>` to a signal form field.
 * Currently unused: some mobile browsers handle multi-select poorly.
 */
@Component({
  // Enhances native file inputs, so the selector matches the element itself.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'input[type=file][multiple]',
  template: ``,
})
export class FilesInput extends FileControl<File[]> {
  readonly value = model<File[]>([]);

  protected override fromFiles(files: FileList | null) {
    return Array.from(files ?? []);
  }

  protected override isEmpty(value: File[]) {
    return value.length === 0;
  }
}
