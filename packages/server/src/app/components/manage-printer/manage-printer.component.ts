import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  form,
  maxLength,
  pattern,
  required,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, map, tap, type Observable } from 'rxjs';
import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';
import { apiErrorMessage } from '../../helpers/api-error/api-error';
import { LiveEventsService } from '../../services/live-events/live-events.service';
import {
  PrinterService,
  type CreatedPrinter,
} from '../../services/printer/printer.service';
import { AlertComponent } from '../alert/alert.component';
import {
  AddModeChoiceComponent,
  type AddMode,
} from './components/add-mode-choice/add-mode-choice.component';
import { CreatedPrinterComponent } from './components/created-printer/created-printer.component';
import { EnrollSetupComponent } from './components/enroll-setup/enroll-setup.component';
import { PrinterFormComponent } from './components/printer-form/printer-form.component';
import { PrinterStatusComponent } from './components/printer-status/printer-status.component';
import {
  emptyPrinterModel,
  NAME_MAX_LENGTH,
  printerPageTitle,
  SLUG_PATTERN,
  toPrinterModel,
} from './helpers/printer-form/printer-form';
import {
  applyLiveEvent,
  type PrinterLiveStatus,
} from '../../helpers/printer-live-status/printer-live-status';

@Component({
  selector: 'app-manage-printer',
  imports: [
    RouterLink,
    AlertComponent,
    AddModeChoiceComponent,
    CreatedPrinterComponent,
    EnrollSetupComponent,
    PrinterFormComponent,
    PrinterStatusComponent,
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
        <app-alert variant="danger">{{ error() }}</app-alert>
      }
      @if (printer()) {
        <app-printer-status
          [online]="status().online"
          [activeJobs]="status().activeJobs"
        />
      }
      @if (printerResource.isLoading()) {
        <p role="status">Loading printer...</p>
      } @else if (created(); as created) {
        <app-created-printer [created]="created" />
      } @else if (isNew && mode() === 'enroll') {
        <app-add-mode-choice
          [enrollment]="enrollment"
          [(mode)]="mode"
        />
        <app-enroll-setup
          [token]="enrollToken()"
          [busy]="enrollResource.isLoading()"
          (create)="createEnrollToken()"
        />
      } @else if (!printerResource.error()) {
        @if (isNew) {
          <app-add-mode-choice
            [enrollment]="enrollment"
            [(mode)]="mode"
          />
        }
        <app-printer-form
          [printerForm]="printerForm"
          [isNew]="isNew"
          [saving]="printerForm().submitting()"
          (remove)="remove()"
        />
      }
    </main>
  `,
})
export class ManagePrinterComponent {
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #printersApi = inject(PrinterService);
  readonly #title = inject(Title);

  readonly slug = this.#route.snapshot.paramMap.get('slug') ?? '';
  readonly isNew = this.slug === 'new';
  /** The server has `PUBLIC_URL`, so printers can enroll from their own computers. */
  readonly enrollment =
    inject(CLIENT_ENVIRONMENT).enrollment ?? false;
  readonly mode = signal<AddMode>(
    this.enrollment ? 'enroll' : 'manual',
  );

  protected readonly printerResource = rxResource({
    params: () => (this.isNew ? undefined : this.slug),
    stream: ({ params }) => this.#printersApi.getAdminPrinter(params),
  });
  readonly printer = computed(() =>
    this.printerResource.hasValue()
      ? this.printerResource.value()
      : undefined,
  );

  /** Live events update the status; a reload of the printer resets it. */
  protected readonly status = linkedSignal<PrinterLiveStatus>(() => {
    const printer = this.printer();
    return {
      online: printer?.online ?? false,
      activeJobs: printer?.activeJobs ?? 0,
      failedJobs: printer?.failedJobs ?? 0,
      lastSeenAt: printer?.lastSeenAt ?? null,
    };
  });

  readonly #model = linkedSignal(() => {
    const printer = this.printer();
    return printer ? toPrinterModel(printer) : emptyPrinterModel();
  });
  readonly printerForm = form(
    this.#model,
    (path) => {
      required(path.name, { message: 'Enter a display name.' });
      maxLength(path.name, NAME_MAX_LENGTH, {
        message: `Enter a name of at most ${NAME_MAX_LENGTH} characters.`,
      });
      required(path.slug, {
        message: 'Use lowercase letters, numbers, and hyphens.',
      });
      pattern(path.slug, SLUG_PATTERN, {
        message: 'Use lowercase letters, numbers, and hyphens.',
      });
      required(path.queue, {
        message: 'Enter a CUPS queue or IPP endpoint.',
      });
    },
    { submission: { action: () => this.#save() } },
  );

  readonly created = signal<CreatedPrinter | null>(null);

  readonly #enrollRequests = signal(0);
  protected readonly enrollResource = rxResource({
    params: () => this.#enrollRequests() || undefined,
    stream: () => this.#printersApi.createEnrollToken(),
  });
  protected readonly enrollToken = computed(() =>
    this.enrollResource.hasValue()
      ? this.enrollResource.value()
      : undefined,
  );

  readonly #deleteRequests = signal(0);
  readonly #deleteResource = rxResource({
    params: () => this.#deleteRequests() || undefined,
    stream: () =>
      this.#printersApi
        .deleteAdminPrinter(this.slug)
        .pipe(tap(() => void this.#router.navigate(['/manage']))),
  });

  /** The first failure from loading, enrolling, deleting, or saving. */
  protected readonly error = computed(() => {
    const failure =
      this.printerResource.error() ??
      this.enrollResource.error() ??
      this.#deleteResource.error();
    return failure
      ? apiErrorMessage(failure)
      : (this.printerForm().errors()[0]?.message ?? '');
  });

  constructor() {
    effect(() => {
      this.#title.setTitle(
        printerPageTitle(this.printerForm.name().value()),
      );
    });

    if (this.isNew) {
      return;
    }
    inject(LiveEventsService)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        const id = this.printer()?.id;
        if (id !== undefined) {
          this.status.update((status) =>
            applyLiveEvent(status, event, id),
          );
        }
      });
  }

  createEnrollToken(): void {
    this.#enrollRequests.update((count) => count + 1);
  }

  remove(): void {
    this.#deleteRequests.update((count) => count + 1);
  }

  #save(): Promise<TreeValidationResult> {
    return firstValueFrom(
      this.isNew ? this.#create() : this.#update(),
    ).then(
      (): TreeValidationResult => undefined,
      (error: unknown): TreeValidationResult => ({
        kind: 'server',
        message: apiErrorMessage(error),
      }),
    );
  }

  #create(): Observable<void> {
    return this.#printersApi
      .createAdminPrinter(this.#model())
      .pipe(map((created) => void this.created.set(created)));
  }

  #update(): Observable<void> {
    return this.#printersApi
      .updateAdminPrinter(this.slug, this.#model())
      .pipe(map(() => void this.#router.navigate(['/manage'])));
  }
}
