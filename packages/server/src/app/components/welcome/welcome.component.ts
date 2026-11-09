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

type ServiceState = 'checking' | 'online' | 'idle' | 'down';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent {
  readonly #status = inject(StatusService);

  /** Printers online, or null while the server is unreachable. */
  protected readonly statusResource = rxResource({
    stream: () =>
      interval(STATUS_POLL_MS).pipe(
        startWith(0),
        switchMap(() =>
          this.#status.getStatus().pipe(
            map((status): number | null => status.printersOnline),
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
    return count === null ? 'down' : count > 0 ? 'online' : 'idle';
  });

  protected readonly summary = computed(() => {
    const count = this.statusResource.hasValue()
      ? (this.statusResource.value() ?? 0)
      : 0;
    switch (this.state()) {
      case 'checking':
        return 'Checking printers…';
      case 'online':
        return `${count} ${inflect(count, 'printer', 'printers')} online`;
      case 'idle':
        return 'No printers online right now';
      case 'down':
        return 'The print service is unavailable';
    }
  });

  protected readonly faqs = [
    {
      question: 'Do I need an app or an account?',
      answer:
        'No. Everything happens in your phone’s web browser — there is nothing to install and no sign-in.',
    },
    {
      question: 'What can I print?',
      answer:
        'PDFs and photos (JPEG, PNG, and iPhone HEIC). You can send several documents at once and choose how many copies of each.',
    },
    {
      question: 'Is my document private?',
      answer:
        'Your document goes only to the printer you chose and is deleted as soon as it prints. Some printers also add a cover sheet on top so others can’t see your pages in the tray.',
    },
    {
      question: 'The QR code says it has expired or is not active yet.',
      answer:
        'Each printed code only works for the dates shown under it. Ask a staff member or volunteer for a current one.',
    },
    {
      question: 'I can’t scan the code. Can I type the address instead?',
      answer:
        'If the poster shows a web address and PIN, open that address in your browser and enter the 9-digit PIN when asked. Otherwise, ask for help at the front desk.',
    },
    {
      question: 'My document didn’t print. What should I do?',
      answer:
        'Check the status above to make sure printers are online, then ask a staff member or volunteer — they can see your job and send it to the printer again.',
    },
  ] as const;
}
