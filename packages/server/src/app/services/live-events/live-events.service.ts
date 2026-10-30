import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import {
  LIVE_EVENTS_PATH,
  type LiveEvent,
} from '@uwacwy/print-shared';
import { firstValueFrom, Observable, share } from 'rxjs';
import { getApiScope } from '../../auth/msal.config';

export type { LiveEvent };

const MAX_RETRY_MS = 30_000;

/** Splits buffered SSE text into complete `data:` payloads and the unfinished remainder. */
export function parseSseFrames(buffer: string): {
  events: LiveEvent[];
  rest: string;
} {
  const frames = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = frames.pop() ?? '';
  const events: LiveEvent[] = [];
  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) {
      continue;
    }
    try {
      events.push(JSON.parse(data) as LiveEvent);
    } catch {
      // Ignore malformed frames rather than dropping the stream.
    }
  }
  return { events, rest };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => (clearTimeout(timer), resolve()),
      { once: true },
    );
  });
}

/**
 * Admin live updates over Server-Sent Events.
 * Uses fetch rather than EventSource because the stream needs the MSAL bearer token.
 * The connection is shared and only open while at least one subscriber is listening.
 */
@Service()
export class LiveEventsService {
  readonly #msal = inject(MsalService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #onlinePrinterIds = signal<ReadonlySet<number>>(
    new Set(),
  );
  readonly #connected = signal(false);

  readonly onlinePrinterIds = this.#onlinePrinterIds.asReadonly();
  readonly connected = this.#connected.asReadonly();

  readonly events: Observable<LiveEvent> = new Observable<LiveEvent>(
    (subscriber) => {
      if (!this.#isBrowser) {
        return;
      }
      const controller = new AbortController();
      void this.#run(controller.signal, (event) => {
        this.#apply(event);
        subscriber.next(event);
      });
      return () => {
        controller.abort();
        this.#connected.set(false);
      };
    },
  ).pipe(share());

  async #run(
    signal: AbortSignal,
    emit: (event: LiveEvent) => void,
  ): Promise<void> {
    let retryMs = 1000;
    while (!signal.aborted) {
      try {
        const response = await fetch(LIVE_EVENTS_PATH, {
          headers: {
            accept: 'text/event-stream',
            authorization: `Bearer ${await this.#accessToken()}`,
          },
          cache: 'no-store',
          signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(
            `Event stream failed (${response.status})`,
          );
        }
        this.#connected.set(true);
        retryMs = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          const parsed = parseSseFrames(
            buffer + decoder.decode(value, { stream: true }),
          );
          buffer = parsed.rest;
          parsed.events.forEach(emit);
        }
      } catch {
        // Network errors and aborts both fall through to the reconnect delay below.
      }
      this.#connected.set(false);
      if (signal.aborted) {
        return;
      }
      await wait(
        retryMs + Math.floor(Math.random() * (retryMs / 3)),
        signal,
      );
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    }
  }

  async #accessToken(): Promise<string> {
    const scope = getApiScope();
    const instance = this.#msal.instance;
    const account =
      instance.getActiveAccount() ?? instance.getAllAccounts()[0];
    if (!scope || !account) {
      throw new Error('Sign in to receive live updates.');
    }
    const result = await firstValueFrom(
      this.#msal.acquireTokenSilent({ scopes: [scope], account }),
    );
    return result.accessToken;
  }

  #apply(event: LiveEvent): void {
    if (event.type === 'snapshot') {
      this.#onlinePrinterIds.set(new Set(event.onlinePrinterIds));
    } else if (event.type === 'agent') {
      this.#onlinePrinterIds.update((current) => {
        const next = new Set(current);
        if (event.online) {
          next.add(event.printerId);
        } else {
          next.delete(event.printerId);
        }
        return next;
      });
    }
  }
}
