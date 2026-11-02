import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { StatusService } from '../../services/status/status.service';

@Component({
  selector: 'app-welcome',
  template: `
    <p role="status" aria-live="polite">
      @if (statusResource.isLoading()) {
        Checking printers…
      } @else if (statusResource.hasValue()) {
        {{ summary() }}
      } @else {
        Unable to check printers.
      }
    </p>
    @if (statusResource.error() && !statusResource.isLoading()) {
      <button
        type="button"
        class="btn btn-outline-primary"
        (click)="statusResource.reload()"
      >
        Try again
      </button>
    }
  `,
})
export class WelcomeComponent {
  readonly #status = inject(StatusService);

  protected readonly statusResource = rxResource({
    stream: () => this.#status.getStatus(),
  });

  protected readonly summary = computed(() => {
    const count = this.statusResource.hasValue()
      ? this.statusResource.value().printersOnline
      : 0;
    return count === 0
      ? 'No printers online.'
      : `${count} ${count === 1 ? 'printer' : 'printers'} online`;
  });
}
