import {
  Directive,
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

/** Signal-form plumbing shared by the single- and multi-file inputs; subclasses map the picked files to their value. */
@Directive()
export abstract class FileControl<
  T,
> implements FormValueControl<T> {
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
  abstract readonly value: ReturnType<typeof model<T>>;
  readonly #host =
    inject<ElementRef<HTMLInputElement>>(ElementRef);

  constructor() {
    const host = this.#host.nativeElement;

    // A native file input can only be cleared programmatically.
    effect(() => {
      if (this.isEmpty(this.value())) {
        host.value = '';
      }
    });

    fromEvent(host, 'change')
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.value.set(this.fromFiles(host.files)),
      );
  }

  focus(options?: FocusOptions): void {
    this.#host.nativeElement.focus(options);
  }

  reset(): void {
    this.value.set(this.fromFiles(null));
  }

  protected abstract fromFiles(files: FileList | null): T;

  protected abstract isEmpty(value: T): boolean;
}
