import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  InputSignal,
  InputSignalWithTransform,
  model,
  ModelSignal,
  output,
  OutputRef,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import {
  applyEach,
  DisabledReason,
  form,
  FormField,
  FormRoot,
  FormValueControl,
  maxLength,
  MaybeFieldTree,
  pattern,
  required,
  validate,
  ValidationError,
  WithOptionalFieldTree,
  type FieldTree,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import {
  MsalBroadcastService,
  MsalService,
} from '@azure/msal-angular';
import { InteractionStatus } from '@azure/msal-browser';
import {
  filter,
  firstValueFrom,
  fromEvent,
  map,
  of,
  startWith,
} from 'rxjs';
import {
  PrinterService,
  type UploadTokenStatus,
} from '../../services/printer/printer.service';
import { FileInput } from './file-input.component';
import { Title } from '@angular/platform-browser';

interface DocumentRow {
  id: number;
  file: File | null;
  /** Kept as a string because native selects bind string values. */
  copies: string;
}

interface UploadModel {
  title: string;
  documents: DocumentRow[];
}

type AccessMode = 'upload' | 'pin' | 'qr-only';

const ACCEPTED_TYPES =
  '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif';
const PIN_DIGITS = 9;
const PIN_HINT = 'Enter the 9-digit PIN posted at the printer.';
const TITLE_MAX_LENGTH = 120;

const TOKEN_MESSAGES: Record<
  Exclude<UploadTokenStatus, 'valid'>,
  string
> = {
  invalid: 'This print link is not valid.',
  expired: 'This print link has expired.',
  'not-yet-valid': 'This QR code is not active yet.',
};

function apiError(error: unknown): {
  code?: string;
  message?: string;
} {
  const body =
    typeof error === 'object' && error !== null && 'error' in error
      ? error.error
      : undefined;
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  return {
    code:
      'code' in body && typeof body.code === 'string'
        ? body.code
        : undefined,
    message:
      'error' in body && typeof body.error === 'string'
        ? body.error
        : undefined,
  };
}

/** HTTP status behind a resource error; rxResource may wrap non-Error values in `cause`. */
function httpStatus(error: unknown): number | undefined {
  const source =
    error instanceof Error && error.cause !== undefined
      ? error.cause
      : error;
  return typeof source === 'object' &&
    source !== null &&
    'status' in source &&
    typeof source.status === 'number'
    ? source.status
    : undefined;
}

/** Formats up to nine digits as ###-###-### while the user types. */
export function formatPinInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, PIN_DIGITS);
  return digits.match(/.{1,3}/g)?.join('-') ?? '';
}

@Component({
  selector: 'app-print',
  imports: [DatePipe, FormField, FormRoot, FileInput],
  templateUrl: './print.component.html',
})
export class PrintComponent {
  readonly #printers = inject(PrinterService);
  readonly #router = inject(Router);
  readonly #msal = inject(MsalService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  #nextId = 1;

  firstFileOrNull(fileList: FileList | null): File | null {
    return fileList?.[0] ?? null;
  }

  readonly slug = input.required<string>();

  readonly token = input<string>();

  /** Re-fetches whenever the slug or token changes (e.g. after a PIN exchange). */
  protected readonly printerResource = rxResource({
    params: () => ({ slug: this.slug(), token: this.token() }),
    stream: ({ params }) =>
      this.#printers.getPrinter(params.slug, params.token),
  });

  /** The MSAL account, re-read whenever an interaction finishes; always null during SSR. */
  readonly #account = toSignal(
    this.#browser
      ? inject(MsalBroadcastService).inProgress$.pipe(
          filter((status) => status === InteractionStatus.None),
          startWith(InteractionStatus.None),
          map(
            () =>
              this.#msal.instance.getActiveAccount() ??
              this.#msal.instance.getAllAccounts()[0] ??
              null,
          ),
        )
      : of(null),
    { initialValue: null },
  );

  readonly acceptedTypes = ACCEPTED_TYPES;
  readonly printer = computed(() =>
    this.printerResource.hasValue()
      ? this.printerResource.value()
      : undefined,
  );

  // readonly #title = inject(Title);

  // readonly titleEffect = effect(() => {
  //   const t = this.printer()?.name;
  //   if (t) {
  //     this.#title.setTitle(t);
  //   } else {
  //     this.#title.setTitle('Print');
  //   }
  // });

  readonly notFound = computed(
    () => httpStatus(this.printerResource.error()) === 404,
  );
  /** Upload tokens take precedence; otherwise a signed-in user the server accepts prints as themselves. */
  readonly #tokenValid = computed(
    () => this.printer()?.access.token === 'valid',
  );
  readonly printingAs = computed(() =>
    !this.#tokenValid() && this.printer()?.access.signedIn
      ? (this.#account()?.username ?? null)
      : null,
  );
  readonly mode = computed<AccessMode>(() => {
    if (this.#tokenValid() || this.printingAs()) {
      return 'upload';
    }
    return this.printer()?.access.pinEnabled ? 'pin' : 'qr-only';
  });
  readonly #tokenNotice = computed(() => {
    const status = this.printer()?.access.token;
    return status && status !== 'valid'
      ? TOKEN_MESSAGES[status]
      : '';
  });
  readonly #submitNotice = signal('');
  readonly notice = computed(
    () => this.#submitNotice() || this.#tokenNotice(),
  );

  readonly copyOptions = computed(() =>
    Array.from(
      { length: this.printer()?.upload.maxCopies ?? 1 },
      (_, index) => String(index + 1),
    ),
  );
  readonly maxUploadMb = computed(() =>
    Math.floor(
      (this.printer()?.upload.maxUploadBytes ?? 0) / 1048576,
    ),
  );

  readonly success = signal('');
  readonly #upload = signal<UploadModel>(this.#emptyUpload());
  readonly uploadForm = form(
    this.#upload,
    (path) => {
      maxLength(path.title, TITLE_MAX_LENGTH);
      validate(path.documents, ({ value }) =>
        value().some((document) => document.file)
          ? undefined
          : {
              kind: 'documents',
              message: 'Choose at least one document to print.',
            },
      );
      applyEach(path.documents, (document) => {
        validate(document.file, ({ value }) => {
          const file = value();
          const limit = this.printer()?.upload.maxUploadBytes;
          return file && limit !== undefined && file.size > limit
            ? {
                kind: 'fileSize',
                message: `${file.name} exceeds the ${this.maxUploadMb()} MB limit.`,
              }
            : undefined;
        });
      });
    },
    { submission: { action: () => this.#submitJob() } },
  );
  /** Form-level problems: no documents chosen, or the server rejected the job. */
  readonly uploadError = computed(() => {
    const documents = this.uploadForm.documents();
    return (
      [
        ...this.uploadForm().errors(),
        ...(documents.touched() ? documents.errors() : []),
      ][0]?.message ?? ''
    );
  });

  readonly #pin = signal({ pin: '' });
  readonly pinForm = form(
    this.#pin,
    (path) => {
      required(path.pin, { message: PIN_HINT });
      // Also renders maxlength so typing stops at ###-###-###.
      maxLength(path.pin, PIN_DIGITS + 2);
      pattern(path.pin, /^\d{3}-\d{3}-\d{3}$/, {
        message: PIN_HINT,
      });
    },
    {
      submission: {
        action: (field) => this.#exchangePin(field.pin),
      },
    },
  );
  readonly pinError = computed(() => this.errorOf(this.pinForm.pin));

  /** The first error message of a field once the user has interacted with it. */
  errorOf(field: FieldTree<unknown>): string {
    const state = field();
    return state.touched() ? (state.errors()[0]?.message ?? '') : '';
  }

  formatPin(): void {
    this.pinForm.pin().value.update(formatPinInput);
  }

  addDocument(): void {
    this.#upload.update((upload) => ({
      ...upload,
      documents: [...upload.documents, this.#newDocument()],
    }));
  }

  removeDocument(id: number): void {
    this.#upload.update((upload) => ({
      ...upload,
      documents: upload.documents.filter(
        (document) => document.id !== id,
      ),
    }));
  }

  pickFile(document: FieldTree<DocumentRow>, event: Event): void {
    const file = document.file();
    file.value.set(
      (event.target as HTMLInputElement).files?.[0] ?? null,
    );
    file.markAsTouched();
  }

  #exchangePin(
    pin: FieldTree<string>,
  ): Promise<TreeValidationResult> {
    return firstValueFrom(
      this.#printers.exchangePin(this.slug(), pin().value()),
    ).then(
      ({ token }) => {
        this.pinForm().reset({ pin: '' });
        this.#submitNotice.set('');
        void this.#router.navigate(['/print', this.slug()], {
          queryParams: { token },
        });
        return undefined;
      },
      (error: unknown) => ({
        kind: 'server',
        fieldTree: pin,
        message:
          apiError(error).message ??
          'Unable to check the PIN. Please try again.',
      }),
    );
  }

  #submitJob(): Promise<TreeValidationResult> {
    const printer = this.printer();
    const token = this.#tokenValid() ? this.token() : null;
    if (!printer || (!token && !this.printingAs())) {
      return Promise.resolve(undefined);
    }
    this.success.set('');
    const { title, documents } = this.#upload();
    const body = new FormData();
    body.set('job__title', title);
    documents
      .flatMap(({ file, copies }) =>
        file ? [{ file, copies }] : [],
      )
      .forEach(({ file, copies }, index) => {
        body.set(`document__copies_${index}`, copies);
        body.set(`document__file_${index}`, file, file.name);
      });

    return firstValueFrom(
      this.#printers.submitJob(printer.slug, body, token),
    ).then(
      (job) => {
        this.success.set(
          job.agentOnline
            ? `"${job.title}" was sent to ${printer.name}.`
            : `"${job.title}" is queued and will print when ${printer.name} is back online.`,
        );
        this.uploadForm().reset(this.#emptyUpload());
        return undefined;
      },
      (error: unknown) => {
        const { code, message } = apiError(error);
        if (code?.startsWith('token_')) {
          // The link stopped working mid-session; drop it so the PIN prompt (or QR hint) returns.
          this.#submitNotice.set(
            message ?? 'This print link is no longer valid.',
          );
          void this.#router.navigate(['/print', printer.slug]);
          return undefined;
        }
        return {
          kind: 'server',
          message:
            message ??
            'Unable to send this print job. Please try again.',
        };
      },
    );
  }

  #emptyUpload(): UploadModel {
    return { title: '', documents: [this.#newDocument()] };
  }

  #newDocument(): DocumentRow {
    return { id: this.#nextId++, file: null, copies: '1' };
  }
}
