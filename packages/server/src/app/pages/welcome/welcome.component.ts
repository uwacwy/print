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

@Component({
  selector: 'app-welcome',
  styleUrl: './welcome.component.scss',
  templateUrl: './welcome.component.html',
})
export class WelcomeComponent {
  protected readonly faqs = [
    {
      answer: $localize`:@@welcome.faq-1.answer:No. Everything happens in your phone’s web browser — there is nothing to install and no sign-in.`,
      question: $localize`:@@welcome.faq-1.question:Do I need an app or an account?`,
    },
    {
      answer: $localize`:@@welcome.faq-2.answer:PDFs and photos (JPEG, PNG, and iPhone HEIC). You can send several documents at once and choose how many copies of each.`,
      question: $localize`:@@welcome.faq-2.question:What can I print?`,
    },
    {
      answer: $localize`:@@welcome.faq-3.answer:Your document goes only to the printer you chose and is deleted as soon as it prints. Some printers also add a cover sheet on top so others can’t see your pages in the tray.`,
      question: $localize`:@@welcome.faq-3.question:Is my document private?`,
    },
    {
      answer: $localize`:@@welcome.faq-4.answer:Each printed code only works for the dates shown under it. Ask a staff member or volunteer for a current one.`,
      question: $localize`:@@welcome.faq-4.question:The QR code says it has expired or is not active yet.`,
    },
    {
      answer: $localize`:@@welcome.faq-5.answer:If the poster shows a web address and PIN, open that address in your browser and enter the 9-digit PIN when asked. Otherwise, ask for help at the front desk.`,
      question: $localize`:@@welcome.faq-5.question:I can’t scan the code. Can I type the address instead?`,
    },
    {
      answer: $localize`:@@welcome.faq-6.answer:Check the status above to make sure printers are online, then ask a staff member or volunteer — they can see your job and send it to the printer again.`,
      question: $localize`:@@welcome.faq-6.question:My document didn’t print. What should I do?`,
    },
  ] as const;

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
