import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toSignal,
} from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  agentSetupCommands,
  enrollSetupCommands,
  type EnrollTokenResponse,
  type SetupCommand,
} from '@uwacwy/print-shared';
import { filter } from 'rxjs';
import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';
import { LiveEventsService } from '../../services/live-events/live-events.service';
import {
  PrinterService,
  type CreatedPrinter,
  type PrinterInput,
  type PrinterSummary,
} from '../../services/printer/printer.service';
import { SetupCommandsComponent } from '../setup-commands/setup-commands.component';

@Component({
  selector: 'app-manage-printer',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    SetupCommandsComponent,
  ],
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
      } @else if (created(); as created) {
        <section
          class="border rounded p-3 mb-4"
          aria-labelledby="agent-token-heading"
        >
          <h2 class="h5" id="agent-token-heading">
            Set up the agent (token shown once)
          </h2>
          <p>
            Run one of these on the computer next to
            {{ created.printer.name }}, or copy the agent token into
            its configuration now. The token is not shown again.
          </p>
          @if (!created.serverUrl) {
            <p class="text-body-secondary">
              Set <code>PUBLIC_URL</code> on the server to get
              ready-made setup commands.
            </p>
          }
          <app-setup-commands [commands]="createdCommands()" />
        </section>
        <a class="btn btn-primary" routerLink="/manage">Done</a>
      } @else if (isNew && mode() === 'enroll') {
        <ng-container *ngTemplateOutlet="modeChoice" />
        <section aria-labelledby="enroll-heading">
          <h2 class="h5" id="enroll-heading">
            Set up on the printer's computer
          </h2>
          @if (enrollToken(); as enroll) {
            <p>
              Run one of these on the computer next to the printer,
              such as a Raspberry Pi with CUPS. It asks whether the
              printer is a CUPS queue or a network (IPP) printer,
              lists the printers it finds, and suggests a name and
              slug. The printer appears in the list when setup
              finishes.
            </p>
            <p>
              Works until {{ enroll.expiresAt | date: 'shortTime' }}.
              Anyone with the command can add a printer until then.
            </p>
            <app-setup-commands [commands]="enrollCommands()" />
            <div class="d-flex gap-2 mt-3">
              <a class="btn btn-primary" routerLink="/manage"
                >Done</a
              >
              <button
                type="button"
                class="btn btn-outline-secondary"
                [disabled]="saving()"
                (click)="createEnrollToken()"
              >
                New command
              </button>
            </div>
          } @else {
            <p>
              Get a command to run on the computer connected to the
              printer. It finds the printer, asks for its name, and
              starts the print agent.
            </p>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="saving()"
              (click)="createEnrollToken()"
            >
              {{ saving() ? 'Creating...' : 'Create setup command' }}
            </button>
          }
        </section>
      } @else {
        @if (isNew) {
          <ng-container *ngTemplateOutlet="modeChoice" />
        }
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
              Public upload URL: /print/{{
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

    <ng-template #modeChoice>
      <fieldset class="mb-4">
        <legend class="h6">
          How do you want to add the printer?
        </legend>
        <div class="form-check">
          <input
            class="form-check-input"
            type="radio"
            name="add-mode"
            id="add-mode-enroll"
            value="enroll"
            aria-describedby="add-mode-enroll-help"
            [checked]="mode() === 'enroll'"
            [disabled]="!enrollment"
            (change)="mode.set('enroll')"
          />
          <label class="form-check-label" for="add-mode-enroll"
            >Set up on the printer's computer</label
          >
          <div class="form-text" id="add-mode-enroll-help">
            @if (enrollment) {
              Recommended. Run one command there; it finds the
              printer for you.
            } @else {
              Unavailable: set <code>PUBLIC_URL</code> on the server
              to enable it.
            }
          </div>
        </div>
        <div class="form-check">
          <input
            class="form-check-input"
            type="radio"
            name="add-mode"
            id="add-mode-manual"
            value="manual"
            aria-describedby="add-mode-manual-help"
            [checked]="mode() === 'manual'"
            (change)="mode.set('manual')"
          />
          <label class="form-check-label" for="add-mode-manual"
            >Enter the printer's details here</label
          >
          <div class="form-text" id="add-mode-manual-help">
            Then copy the agent's settings to its computer or a
            Docker Compose file.
          </div>
        </div>
      </fieldset>
    </ng-template>
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
  /** The server has `PUBLIC_URL`, so printers can enroll from their own computers. */
  readonly enrollment =
    inject(CLIENT_ENVIRONMENT).enrollment ?? false;
  readonly mode = signal<'enroll' | 'manual'>(
    this.enrollment ? 'enroll' : 'manual',
  );
  readonly enrollToken = signal<EnrollTokenResponse | null>(null);
  readonly enrollCommands = computed(() => {
    const enroll = this.enrollToken();
    return enroll
      ? enrollSetupCommands(enroll.serverUrl, enroll.token)
      : [];
  });
  readonly created = signal<CreatedPrinter | null>(null);
  readonly createdCommands = computed((): SetupCommand[] => {
    const created = this.created();
    if (!created) {
      return [];
    }
    const { printer, agentToken, serverUrl } = created;
    return [
      { id: 'token', label: 'Agent token', command: agentToken },
      ...(serverUrl
        ? agentSetupCommands({
            serverUrl,
            agentToken,
            printerUri: printer.queue,
            slug: printer.slug,
          })
        : []),
    ];
  });
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

  readonly #title = inject(Title);

  readonly printerName = toSignal(
    this.form.controls.name.valueChanges,
  );

  readonly pageTitle = computed(() => {
    const name = this.printerName();
    return name ? `Manage ${name}` : 'Manage Printer';
  }, {});

  constructor() {
    effect(() => {
      this.#title.setTitle(this.pageTitle());
    });

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
        next: (created) => {
          this.created.set(created);
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

  createEnrollToken(): void {
    this.saving.set(true);
    this.error.set('');
    this.#printersApi.createEnrollToken().subscribe({
      next: (enroll) => {
        this.enrollToken.set(enroll);
        this.saving.set(false);
      },
      error: (error: unknown) => this.fail(error),
    });
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
