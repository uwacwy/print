import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { inflect } from '@uwacwy/print-shared';
import {
  catchError,
  interval,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import { StatusService } from '../../services/status/status.service';

/** How often the status indicator re-checks the server. */
export const STATUS_POLL_MS = 30_000;

type ServiceState = 'checking' | 'down' | 'idle' | 'online';

/** Pill showing whether the print service is reachable and how many printers are online. */
@Component({
  selector: 'app-status-pill',
  styleUrl: './status-pill.component.scss',
  template: `
    <div class="status" [attr.data-state]="state()">
      <span class="status-dot" aria-hidden="true"></span>
      <span role="status" aria-live="polite">{{
        summary()
      }}</span>
      @if (state() === 'down' && !statusResource.isLoading()) {
        <span class="status-stop" aria-hidden="true">.</span>
        <button
          i18n="@@welcome.try-again"
          type="button"
          class="btn btn-link link-secondary p-0 align-baseline"
          (click)="statusResource.reload()"
        >
          Try again
        </button>
      }
    </div>
  `,
})
export class StatusPillComponent {
  /** Printers online, or null while the server is unreachable. */
  protected readonly statusResource = rxResource({
    stream: () =>
      interval(STATUS_POLL_MS).pipe(
        startWith(0),
        switchMap(() =>
          this.#status.getStatus().pipe(
            map(
              (status): null | number => status.printersOnline,
            ),
            catchError(() => of(null)),
          ),
        ),
      ),
  });

  protected readonly state = computed((): ServiceState => {
    if (!this.statusResource.hasValue()) {
      return this.statusResource.error() ? 'down' : 'checking';
    }
    const count = this.statusResource.value();
    return count === null
      ? 'down'
      : count > 0
        ? 'online'
        : 'idle';
  });

  protected readonly summary = computed(() => {
    const count = this.statusResource.hasValue()
      ? (this.statusResource.value() ?? 0)
      : 0;
    switch (this.state()) {
      case 'checking':
        return $localize`:@@welcome.status-checking:Checking printers…`;
      case 'down':
        return $localize`:@@welcome.status-down:The print service is unavailable`;
      case 'idle':
        return $localize`:@@welcome.status-idle:No printers online right now`;
      case 'online':
        return $localize`:@@welcome.status-online:${count}:count: ${inflect(count, 'printer', 'printers')}:noun: online`;
    }
  });

  readonly #status = inject(StatusService);
}
