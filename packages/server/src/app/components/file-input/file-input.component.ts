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

/** Binds a single-file `<input type="file">` to a signal form field. */
@Component({
  // Enhances native file inputs, so the selector matches the element itself.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'input[type=file]:not([multiple])',
  template: ``,
})
export class FileInput implements FormValueControl<File | null> {
  readonly #host = inject<ElementRef<HTMLInputElement>>(ElementRef);

  readonly value = model<File | null>(null);

  readonly touched = input<boolean>(false);
  readonly touch = output<void>();

  readonly disabled = input<boolean>(false);
  readonly disabledReasons = input<
    readonly WithOptionalFieldTree<DisabledReason>[]
  >([]);
  readonly readonly = input<boolean>(false);
  readonly hidden = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly errors = input<
    readonly WithOptionalFieldTree<ValidationError>[]
  >([]);
  readonly pending = input<boolean>(false);
  readonly dirty = input<boolean>(false);
  readonly name = input<string>('');
  readonly required = input<boolean>(false);

  constructor() {
    const host = this.#host.nativeElement;

    // A native file input can only be cleared programmatically.
    effect(() => {
      if (this.value() === null) {
        host.value = '';
      }
    });

    fromEvent(host, 'change')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.value.set(host.files?.[0] ?? null));
  }

  focus(options?: FocusOptions): void {
    this.#host.nativeElement.focus(options);
  }

  reset(): void {
    this.value.set(null);
  }
}
