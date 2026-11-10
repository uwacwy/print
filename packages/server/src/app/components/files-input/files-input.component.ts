import {
  Component,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DisabledReason,
  FormValueControl,
  ValidationError,
  WithOptionalFieldTree,
} from '@angular/forms/signals';
import { fromEvent } from 'rxjs';

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
export class FilesInput implements FormValueControl<File[]> {
  readonly dirty = input<boolean>(false);

  readonly disabled = input<boolean>(false);

  readonly disabledReasons = input<
    readonly WithOptionalFieldTree<DisabledReason>[]
  >([]);
  readonly errors = input<
    readonly WithOptionalFieldTree<ValidationError>[]
  >([]);

  readonly hidden = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly name = input<string>('');
  readonly pending = input<boolean>(false);
  readonly readonly = input<boolean>(false);
  readonly required = input<boolean>(false);
  readonly touch = output<void>();
  readonly touched = input<boolean>(false);
  readonly value = model<File[]>([]);
  readonly #host =
    inject<ElementRef<HTMLInputElement>>(ElementRef);

  constructor() {
    const host = this.#host.nativeElement;

    // A native file input can only be cleared programmatically.
    effect(() => {
      if (this.value().length === 0) {
        host.value = '';
      }
    });

    fromEvent(host, 'change')
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.value.set(Array.from(host.files ?? [])),
      );
  }

  focus(options?: FocusOptions): void {
    this.#host.nativeElement.focus(options);
  }

  reset(): void {
    this.value.set([]);
  }
}
