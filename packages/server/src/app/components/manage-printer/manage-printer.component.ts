import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { LiveEventsService } from '../../services/live-events/live-events.service';
import {
  PrinterService,
  type PrinterInput,
  type PrinterSummary,
} from '../../services/printer/printer.service';

@Component({
  selector: 'app-manage-printer',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="container py-4">
      <a routerLink="/manage" class="link-secondary"
        >&larr; Printers</a
      >
      <h1 class="h2 mt-3 mb-4">
        {{ isNew ? 'Add printer' : 'Edit printer' }}
      </h1>

      @if (error()) {
        <div class="alert alert-danger" role="alert">
          {{ error() }}
        </div>
      }
      @if (!isNew && !loading()) {
        <p role="status">
          Agent:
          @if (online()) {
            <span class="badge text-bg-success">Online</span>
          } @else {
            <span class="badge text-bg-secondary">Offline</span>
          }
          <span class="text-muted ms-2"
            >{{ activeJobs() }} active job(s)</span
          >
        </p>
      }
      @if (loading()) {
        <p role="status">Loading printer...</p>
      } @else if (agentToken()) {
        <section
          class="border rounded p-3 mb-4"
          aria-labelledby="agent-token-heading"
        >
          <h2 class="h5" id="agent-token-heading">
            Agent token (shown once)
          </h2>
          <p class="mb-2">
            Copy this token into the printer agent configuration now.
          </p>
          <code class="d-block text-break user-select-all">{{
            agentToken()
          }}</code>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm mt-3"
            (click)="copyToken()"
          >
            Copy token
          </button>
          @if (copied()) {
            <span class="ms-2" role="status">Copied</span>
          }
        </section>
        <a class="btn btn-primary" routerLink="/manage">Done</a>
      } @else {
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="d-flex flex-column gap-3"
        >
          <div>
            <label class="form-label" for="printer-name"
              >Display name</label
            >
            <input
              id="printer-name"
              class="form-control"
              formControlName="name"
              autocomplete="off"
            />
            @if (
              form.controls.name.touched &&
              form.controls.name.invalid
            ) {
              <div class="form-text text-danger">
                Enter a name of at most 100 characters.
              </div>
            }
          </div>
          <div>
            <label class="form-label" for="printer-slug"
              >Upload slug</label
            >
            <input
              id="printer-slug"
              class="form-control"
              formControlName="slug"
              autocomplete="off"
            />
            <div class="form-text">
              Public upload URL: /printer/{{
                form.controls.slug.value || 'slug'
              }}
            </div>
            @if (
              form.controls.slug.touched &&
              form.controls.slug.invalid
            ) {
              <div class="form-text text-danger">
                Use lowercase letters, numbers, and hyphens.
              </div>
            }
          </div>
          <div>
            <label class="form-label" for="printer-queue"
              >Printer destination</label
            >
            <input
              id="printer-queue"
              class="form-control"
              formControlName="queue"
              autocomplete="off"
            />
            <div class="form-text">
              Use cups://Queue_Name or an ipp:// printer endpoint.
            </div>
            @if (
              form.controls.queue.touched &&
              form.controls.queue.invalid
            ) {
              <div class="form-text text-danger">
                Enter a CUPS queue or IPP endpoint.
              </div>
            }
          </div>
          <label class="form-check">
            <input
              id="printer-cover-page"
              class="form-check-input"
              type="checkbox"
              formControlName="coverPage"
            />
            <span class="form-check-label"
              >Print a privacy cover page</span
            >
          </label>
          <div class="d-flex gap-2">
            <button
              class="btn btn-primary"
              type="submit"
              [disabled]="saving()"
            >
              {{
                saving()
                  ? 'Saving...'
                  : isNew
                    ? 'Create printer'
                    : 'Save changes'
              }}
            </button>
            @if (!isNew) {
              <button
                class="btn btn-outline-danger"
                type="button"
                (click)="confirmDelete.set(true)"
              >
                Delete printer
              </button>
            }
          </div>
        </form>

        @if (confirmDelete()) {
          <div class="alert alert-warning mt-4" role="alert">
            <p>Delete this printer and its queued jobs?</p>
            <button
              class="btn btn-danger btn-sm me-2"
              type="button"
              (click)="remove()"
            >
              Confirm delete
            </button>
            <button
              class="btn btn-outline-secondary btn-sm"
              type="button"
              (click)="confirmDelete.set(false)"
            >
              Cancel
            </button>
          </div>
        }
      }
    </main>
  `,
})
export class ManagePrinterComponent {
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #printersApi = inject(PrinterService);
  readonly slug = this.#route.snapshot.paramMap.get('slug') ?? '';
  readonly isNew = this.slug === 'new';
  /** Live events identify printers by numeric id, known once the printer loads. */
  readonly #id = signal<number | null>(null);
  readonly loading = signal(!this.isNew);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly agentToken = signal('');
  readonly copied = signal(false);
  readonly confirmDelete = signal(false);
  readonly online = signal(false);
  readonly activeJobs = signal(0);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
      ],
    }),
    queue: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    coverPage: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    if (this.isNew) {
      return;
    }
    this.loadPrinter();
    inject(LiveEventsService)
      .events.pipe(
        filter(
          (event) =>
            this.#id() !== null &&
            (event.type === 'snapshot' ||
              event.printerId === this.#id()),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event.type === 'snapshot') {
          this.online.set(
            event.onlinePrinterIds.includes(this.#id()!),
          );
        } else if (event.type === 'agent') {
          this.online.set(event.online);
        } else {
          this.activeJobs.set(event.activeJobs);
        }
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const input: PrinterInput = this.form.getRawValue();
    this.saving.set(true);
    this.error.set('');

    if (this.isNew) {
      this.#printersApi.createAdminPrinter(input).subscribe({
        next: ({ agentToken }) => {
          this.agentToken.set(agentToken);
          this.saving.set(false);
        },
        error: (error: unknown) => this.fail(error),
      });
      return;
    }

    this.#printersApi
      .updateAdminPrinter(this.slug, input)
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.#router.navigate(['/manage']);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  remove(): void {
    this.#printersApi.deleteAdminPrinter(this.slug).subscribe({
      next: () => void this.#router.navigate(['/manage']),
      error: (error: unknown) => this.fail(error),
    });
  }

  async copyToken(): Promise<void> {
    await navigator.clipboard.writeText(this.agentToken());
    this.copied.set(true);
  }

  private loadPrinter(): void {
    this.#printersApi.getAdminPrinter(this.slug).subscribe({
      next: (printer: PrinterSummary) => {
        this.#id.set(printer.id);
        this.form.patchValue({
          name: printer.name,
          slug: printer.slug,
          queue: printer.queue,
          coverPage: printer.coverPage,
        });
        this.online.set(printer.online);
        this.activeJobs.set(printer.activeJobs);
        this.loading.set(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    this.loading.set(false);
    const message =
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'error' in error.error &&
      typeof error.error.error === 'string'
        ? error.error.error
        : 'Request failed. Check the printer fields and try again.';
    this.error.set(message);
  }
}
