import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import {
  PrinterService,
  type PublicPrinter,
  type UploadTokenStatus,
} from '../../services/printer/printer.service';

interface DocumentRow {
  id: number;
  file: File | null;
  copies: number;
}

interface PageState {
  token: string | null;
  printer: PublicPrinter | undefined;
}

type AccessMode = 'upload' | 'pin' | 'qr-only';

const ACCEPTED_TYPES =
  '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif';
const PIN_DIGITS = 9;

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

/** Formats up to nine digits as ###-###-### while the user types. */
export function formatPinInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, PIN_DIGITS);
  return digits.match(/.{1,3}/g)?.join('-') ?? '';
}

@Component({
  selector: 'app-print',
  imports: [ReactiveFormsModule, DatePipe],
  template: `
    <main class="col">
      @if (loading()) {
        <h1 class="h2">Print</h1>
        <p role="status">Loading printer...</p>
      } @else if (printer(); as printer) {
        <h1 class="h2 mb-1">Print to {{ printer.name }}</h1>

        @if (notice()) {
          <div class="alert alert-warning" role="alert">
            {{ notice() }}
          </div>
        }

        @switch (mode()) {
          @case ('upload') {
            <p class="text-muted">
              PDF, JPEG, PNG, or HEIC; up to {{ maxUploadMb() }} MB
              per document.
              @if (printer.access.tokenExpiresAt; as expiresAt) {
                This link works until
                {{ expiresAt | date: 'short' }}.
              }
            </p>

            <div aria-live="polite" aria-atomic="true">
              @if (success(); as success) {
                <div class="alert alert-success" role="status">
                  {{ success }}
                </div>
              }
            </div>
            @if (error()) {
              <div class="alert alert-danger" role="alert">
                {{ error() }}
              </div>
            }

            <form
              [formGroup]="form"
              (ngSubmit)="submit(printer)"
              class="d-flex flex-column gap-3"
            >
              <div>
                <label class="form-label" for="job-title"
                  >Job title (optional)</label
                >
                <input
                  id="job-title"
                  class="form-control"
                  formControlName="title"
                  maxlength="120"
                />
              </div>

              <fieldset class="border rounded p-3">
                <legend class="float-none w-auto px-2 fs-6 mb-0">
                  Documents
                </legend>
                @for (
                  document of documents();
                  track document.id;
                  let index = $index
                ) {
                  <div class="row g-2 align-items-end mb-3">
                    <div class="col-sm-7">
                      <label
                        class="form-label"
                        [for]="'document-file-' + document.id"
                      >
                        Document {{ index + 1 }}
                      </label>
                      <input
                        class="form-control"
                        type="file"
                        [id]="'document-file-' + document.id"
                        [accept]="acceptedTypes"
                        (change)="pickFile(document.id, $event)"
                      />
                    </div>
                    <div class="col-6 col-sm-3">
                      <label
                        class="form-label"
                        [for]="'document-copies-' + document.id"
                        >Copies</label
                      >
                      <select
                        class="form-select"
                        [id]="'document-copies-' + document.id"
                        [value]="document.copies"
                        (change)="setCopies(document.id, $event)"
                      >
                        @for (count of copyOptions(); track count) {
                          <option [value]="count">
                            {{ count }}
                          </option>
                        }
                      </select>
                    </div>
                    <div class="col-6 col-sm-2">
                      <button
                        type="button"
                        class="btn btn-outline-secondary w-100"
                        [disabled]="documents().length <= 1"
                        [attr.aria-label]="
                          'Remove document ' + (index + 1)
                        "
                        (click)="removeDocument(document.id)"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                }
                <button
                  type="button"
                  class="btn btn-outline-primary"
                  [disabled]="
                    documents().length >= printer.upload.maxDocuments
                  "
                  (click)="addDocument()"
                >
                  Add another document
                </button>
              </fieldset>

              <div>
                <button
                  class="btn btn-primary"
                  type="submit"
                  [disabled]="submitting()"
                >
                  {{ submitting() ? 'Sending...' : 'Print' }}
                </button>
              </div>
            </form>
          }
          @case ('pin') {
            <p class="text-muted">
              Enter the PIN posted at the printer, or scan its QR
              code.
            </p>
            <form
              [formGroup]="pinForm"
              class="d-flex flex-column gap-3"
              (ngSubmit)="exchangePin(printer)"
              novalidate
            >
              <div>
                <label class="form-label" for="printer-pin"
                  >Printer PIN</label
                >
                <input
                  id="printer-pin"
                  class="form-control form-control-lg font-monospace"
                  [class.is-invalid]="!!pinError()"
                  formControlName="pin"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  placeholder="123-456-789"
                  maxlength="11"
                  aria-describedby="printer-pin-help"
                  [attr.aria-invalid]="!!pinError()"
                  [attr.aria-errormessage]="
                    pinError() ? 'printer-pin-error' : null
                  "
                  (input)="formatPin()"
                />
                <div id="printer-pin-help" class="form-text">
                  9 digits
                </div>
                @if (pinError()) {
                  <div
                    id="printer-pin-error"
                    class="invalid-feedback d-block"
                    role="alert"
                  >
                    {{ pinError() }}
                  </div>
                }
              </div>
              <div>
                <button
                  class="btn btn-primary"
                  type="submit"
                  [disabled]="exchanging()"
                >
                  {{ exchanging() ? 'Checking...' : 'Continue' }}
                </button>
              </div>
            </form>
          }
          @default {
            <p>Scan the QR code posted at the printer to print.</p>
          }
        }
      } @else {
        <h1 class="h2">Printer not found</h1>
        <p>Check the link or QR code and try again.</p>
      }
    </main>
  `,
})
export class PrintComponent {
  readonly #printers = inject(PrinterService);
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #slug = this.#route.snapshot.paramMap.get('slug') ?? '';
  #nextId = 1;

  /** Re-fetches whenever the token query parameter changes (e.g. after a PIN exchange). */
  readonly #state = toSignal(
    this.#route.queryParamMap.pipe(
      map((params) => params.get('token')),
      distinctUntilChanged(),
      switchMap((token) =>
        this.#printers.getPrinter(this.#slug, token).pipe(
          map((printer): PageState => ({ token, printer })),
          catchError(() =>
            of<PageState>({ token, printer: undefined }),
          ),
          startWith(undefined),
        ),
      ),
    ),
  );

  readonly acceptedTypes = ACCEPTED_TYPES;
  readonly loading = computed(() => this.#state() === undefined);
  readonly printer = computed(() => this.#state()?.printer);
  readonly mode = computed<AccessMode>(() => {
    const access = this.printer()?.access;
    if (access?.token === 'valid') {
      return 'upload';
    }
    return access?.pinEnabled ? 'pin' : 'qr-only';
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

  readonly documents = signal<DocumentRow[]>([this.#newDocument()]);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
  });

  readonly pin = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.pattern(/^\d{3}-\d{3}-\d{3}$/),
    ],
  });
  readonly pinForm = new FormGroup({ pin: this.pin });
  readonly pinError = signal('');
  readonly exchanging = signal(false);

  readonly copyOptions = computed(() =>
    Array.from(
      { length: this.printer()?.upload.maxCopies ?? 1 },
      (_, index) => index + 1,
    ),
  );
  readonly maxUploadMb = computed(() =>
    Math.floor(
      (this.printer()?.upload.maxUploadBytes ?? 0) / 1048576,
    ),
  );

  formatPin(): void {
    this.pin.setValue(formatPinInput(this.pin.value));
  }

  exchangePin(printer: PublicPrinter): void {
    this.formatPin();
    if (this.pin.invalid) {
      this.pinError.set(
        'Enter the 9-digit PIN posted at the printer.',
      );
      return;
    }
    this.pinError.set('');
    this.exchanging.set(true);
    this.#printers
      .exchangePin(printer.slug, this.pin.value)
      .subscribe({
        next: ({ token }) => {
          this.exchanging.set(false);
          this.pin.reset();
          this.#submitNotice.set('');
          void this.#router.navigate(['/print', printer.slug], {
            queryParams: { token },
          });
        },
        error: (error: unknown) => {
          this.exchanging.set(false);
          this.pinError.set(
            apiError(error).message ??
              'Unable to check the PIN. Please try again.',
          );
        },
      });
  }

  addDocument(): void {
    this.documents.update((documents) => [
      ...documents,
      this.#newDocument(),
    ]);
  }

  removeDocument(id: number): void {
    this.documents.update((documents) =>
      documents.filter((document) => document.id !== id),
    );
  }

  pickFile(id: number, event: Event): void {
    const file =
      (event.target as HTMLInputElement).files?.[0] ?? null;
    this.#updateDocument(id, { file });
  }

  setCopies(id: number, event: Event): void {
    this.#updateDocument(id, {
      copies: Number((event.target as HTMLSelectElement).value),
    });
  }

  submit(printer: PublicPrinter): void {
    this.error.set('');
    this.success.set('');
    const chosen = this.documents().filter(
      (document) => document.file,
    );
    if (!chosen.length) {
      this.error.set('Choose at least one document to print.');
      return;
    }
    const tooLarge = chosen.find(
      (document) =>
        document.file!.size > printer.upload.maxUploadBytes,
    );
    if (tooLarge) {
      this.error.set(
        `${tooLarge.file!.name} exceeds the ${this.maxUploadMb()} MB limit.`,
      );
      return;
    }

    const body = new FormData();
    body.set('job__title', this.form.getRawValue().title);
    chosen.forEach((document, index) => {
      body.set(`document__copies_${index}`, String(document.copies));
      body.set(
        `document__file_${index}`,
        document.file!,
        document.file!.name,
      );
    });

    const token = this.#state()?.token;
    if (!token) {
      return;
    }
    this.submitting.set(true);
    this.#printers.submitJob(printer.slug, body, token).subscribe({
      next: (job) => {
        this.submitting.set(false);
        this.success.set(
          job.agentOnline
            ? `"${job.title}" was sent to ${printer.name}.`
            : `"${job.title}" is queued and will print when ${printer.name} is back online.`,
        );
        this.form.reset();
        this.documents.set([this.#newDocument()]);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const { code, message } = apiError(error);
        if (code?.startsWith('token_')) {
          // The link stopped working mid-session; drop it so the PIN prompt (or QR hint) returns.
          this.#submitNotice.set(
            message ?? 'This print link is no longer valid.',
          );
          void this.#router.navigate(['/print', printer.slug]);
          return;
        }
        this.error.set(
          message ??
            'Unable to send this print job. Please try again.',
        );
      },
    });
  }

  #newDocument(): DocumentRow {
    return { id: this.#nextId++, file: null, copies: 1 };
  }

  #updateDocument(id: number, changes: Partial<DocumentRow>): void {
    this.documents.update((documents) =>
      documents.map((document) =>
        document.id === id ? { ...document, ...changes } : document,
      ),
    );
  }
}
