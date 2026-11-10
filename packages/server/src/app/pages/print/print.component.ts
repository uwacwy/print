import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  applyEach,
  type FieldTree,
  form,
  maxLength,
  pattern,
  required,
  type TreeValidationResult,
  validate,
} from '@angular/forms/signals';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { type AccountInfo } from '@azure/msal-browser';
import { firstValueFrom } from 'rxjs';

import { activeAccount } from '../../auth/active-account/active-account';
import { AlertComponent } from '../../components/alert/alert.component';
import {
  apiErrorCode,
  apiErrorMessage,
  httpStatus,
} from '../../helpers/api-error/api-error';
import { PrinterService } from '../../services/printer/printer.service';
import { PinFormComponent } from './components/pin-form/pin-form.component';
import { UploadFormComponent } from './components/upload-form/upload-form.component';
import {
  PIN_HINT,
  PIN_MAX_LENGTH,
  PIN_PATTERN,
} from './helpers/print-pin/print-pin';
import {
  addDocument,
  buildJobBody,
  copyOptions,
  emptyUpload,
  fileSizeError,
  hasDocument,
  jobSentNotice,
  maxUploadMb,
  NO_DOCUMENTS_MESSAGE,
  removeDocument,
  TITLE_MAX_LENGTH,
  tokenNotice,
  type UploadModel,
} from './helpers/print-upload/print-upload';

type AccessMode = 'pin' | 'qr-only' | 'upload';

@Component({
  imports: [
    DatePipe,
    AlertComponent,
    PinFormComponent,
    UploadFormComponent,
  ],
  selector: 'app-print',
  templateUrl: './print.component.html',
})
export class PrintComponent {
  /** Re-fetches whenever the slug or token changes (e.g. after a PIN exchange). */
  protected readonly printerResource = rxResource({
    params: () => ({ slug: this.slug(), token: this.token() }),
    stream: ({ params }) =>
      this.#printers.getPrinter(params.slug, params.token),
  });
  readonly printer = computed(() =>
    this.printerResource.hasValue()
      ? this.printerResource.value()
      : undefined,
  );
  readonly copyOptions = computed(() =>
    copyOptions(this.printer()?.upload.maxCopies),
  );
  readonly maxUploadMb = computed(() =>
    maxUploadMb(this.printer()?.upload.maxUploadBytes),
  );
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The MSAL account, re-read whenever an interaction finishes; always null during SSR. */
  readonly #account = this.#browser
    ? activeAccount()
    : signal<AccountInfo | null>(null);

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

  readonly notFound = computed(
    () => httpStatus(this.printerResource.error()) === 404,
  );

  readonly #submitNotice = signal('');

  readonly #tokenNotice = computed(() =>
    tokenNotice(this.printer()?.access.token),
  );
  readonly notice = computed(
    () => this.#submitNotice() || this.#tokenNotice(),
  );
  readonly #pin = signal({ pin: '' });
  readonly pinForm = form(
    this.#pin,
    (path) => {
      required(path.pin, { message: PIN_HINT });
      // Also renders maxlength so typing stops at ###-###-###.
      maxLength(path.pin, PIN_MAX_LENGTH);
      pattern(path.pin, PIN_PATTERN, { message: PIN_HINT });
    },
    {
      submission: {
        action: (field) => this.#exchangePin(field.pin),
      },
    },
  );
  readonly slug = input.required<string>();
  readonly success = signal('');
  readonly token = input<string>();

  #nextId = 1;
  readonly #upload = signal<UploadModel>(
    emptyUpload(this.#nextId++),
  );

  readonly uploadForm = form(
    this.#upload,
    (path) => {
      maxLength(path.title, TITLE_MAX_LENGTH);
      validate(path.documents, ({ value }) =>
        hasDocument(value())
          ? undefined
          : { kind: 'documents', message: NO_DOCUMENTS_MESSAGE },
      );
      applyEach(path.documents, (document) => {
        validate(document.file, ({ value }) => {
          const message = fileSizeError(
            value(),
            this.printer()?.upload.maxUploadBytes,
          );
          return message
            ? { kind: 'fileSize', message }
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
  readonly #printers = inject(PrinterService);
  readonly #router = inject(Router);

  readonly #title = inject(Title);
  constructor() {
    effect(() => {
      const printer = this.printer();
      if (printer) {
        this.#title.setTitle(`${printer.name}`);
      }
    });
  }

  addDocument(): void {
    this.#upload.update((upload) =>
      addDocument(upload, this.#nextId++),
    );
  }

  removeDocument(id: number): void {
    this.#upload.update((upload) => removeDocument(upload, id));
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
        fieldTree: pin,
        kind: 'server',
        message: apiErrorMessage(
          error,
          'Unable to check the PIN. Please try again.',
        ),
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

    return firstValueFrom(
      this.#printers.submitJob(
        printer.slug,
        buildJobBody(this.#upload()),
        token,
      ),
    ).then(
      (job) => {
        this.success.set(jobSentNotice(job, printer.name));
        this.uploadForm().reset(emptyUpload(this.#nextId++));
        return undefined;
      },
      (error: unknown) => {
        if (apiErrorCode(error)?.startsWith('token_')) {
          // The link stopped working mid-session; drop it so the PIN prompt (or QR hint) returns.
          this.#submitNotice.set(
            apiErrorMessage(
              error,
              'This print link is no longer valid.',
            ),
          );
          void this.#router.navigate(['/print', printer.slug]);
          return undefined;
        }
        return {
          kind: 'server',
          message: apiErrorMessage(
            error,
            'Unable to send this print job. Please try again.',
          ),
        };
      },
    );
  }
}
