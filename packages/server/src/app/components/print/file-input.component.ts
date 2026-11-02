import {
  Component,
  DestroyRef,
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

const firstFileOrNull = (files: FileList | null) =>
  files?.[0] ?? null;

type HTMLFileInputElement = HTMLInputElement & { files: FileList };

const isFileInput = (el: any): el is HTMLFileInputElement =>
  el instanceof HTMLInputElement && 'files' in el;

@Component({
  selector: 'input[type=file]:not([multiple])',
  template: `<!-- file input -->`,
})
export class FileInput implements FormValueControl<File | null> {
  readonly #host =
    inject<ElementRef<HTMLInputElement & { files: FileList }>>(
      ElementRef,
    );

  readonly value = model<File | null>(null);

  // Writable interaction state - control updates these
  readonly touched = input<boolean>(false);
  readonly touch = output<void>();

  // Read-only state - form system manages these
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
    const hostElement = this.#host.nativeElement;

    effect(() => {
      if (this.value() === null) {
        hostElement.value = '';
      }
    });

    fromEvent(this.#host.nativeElement, 'change')
      .pipe(takeUntilDestroyed())
      .subscribe((e) => {
        this.value.set(
          firstFileOrNull(this.#host.nativeElement.files),
        );
      });
  }

  // touch?: OutputRef<void> | undefined;
  focus(options?: FocusOptions): void {
    console.log({ options });
    this.#host.nativeElement.focus();
  }
  reset(): void {
    this.value.set(null);
  }
}

@Component({
  selector: 'input[type=file][multiple]',
  template: `<!-- file input -->`,
})
export class FilesInput implements FormValueControl<File[]> {
  readonly #host =
    inject<ElementRef<HTMLInputElement & { files: FileList }>>(
      ElementRef,
    );

  readonly value = model<File[]>([]);

  // Writable interaction state - control updates these
  readonly touched = input<boolean>(false);
  readonly touch = output<void>();

  // Read-only state - form system manages these
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
    const hostElement = this.#host.nativeElement;

    effect(() => {
      if (this.value().length === 0) {
        hostElement.value = '';
      }
    });

    fromEvent(this.#host.nativeElement, 'change')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.value.set(Array.from(hostElement.files));
      });
  }

  // touch?: OutputRef<void> | undefined;
  focus(options?: FocusOptions): void {
    console.log({ options });
    this.#host.nativeElement.focus();
  }
  reset(): void {
    this.value.set([]);
  }
}
