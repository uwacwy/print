import { isPlatformBrowser } from '@angular/common';
import {
  inject,
  InjectionToken,
  PLATFORM_ID,
  Service,
  signal,
} from '@angular/core';
import { MsalService } from '@azure/msal-angular';
import {
  LIVE_NAMESPACE,
  type LiveEvent,
  type LiveServerEvents
} from '@uwacwy/print-shared';
import { firstValueFrom, Observable, share } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { createRouting } from 'ts-routes';
import { root } from '../../../shared/routes/routes';
import { CLIENT_ENVIRONMENT } from '../../auth/client-environment';
import { getApiScope } from '../../auth/msal.config';

export type { LiveEvent };

/** The socket.io client factory; replaced in tests. */
export const SOCKET_IO = new InjectionToken<typeof io>('SOCKET_IO', {
  factory: () => io,
});

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

const $ = createRouting(root);

/**
 * Admin live updates over the socket.io `/live` namespace, authenticated with the MSAL token.
 * The connection is shared and only open while at least one subscriber is listening.
 */
@Service()
export class LiveEventsService {
  readonly #msal = inject(MsalService);
  readonly #clientEnvironment = inject(CLIENT_ENVIRONMENT);
  readonly #io = inject(SOCKET_IO);
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
      const socket: Socket<LiveServerEvents> = this.#io(
        LIVE_NAMESPACE,
        {
          path: $.ws(),
          // Called on every attempt, so reconnects pick up refreshed tokens.
          auth: (send) => {
            void this.#accessToken().then(
              (token) => send({ token }),
              () => send({}),
            );
          },
          reconnectionDelay: MIN_RETRY_MS,
          reconnectionDelayMax: MAX_RETRY_MS,
        },
      );

      // socket.io retries dropped transports itself, but not rejected handshakes or
      // server-initiated disconnects (e.g. a server reload), so those retry here.
      let retryMs = MIN_RETRY_MS;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const retry = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => socket.connect(),
          retryMs + Math.floor(Math.random() * (retryMs / 3)),
        );
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      };

      socket.on('connect', () => {
        retryMs = MIN_RETRY_MS;
        this.#connected.set(true);
      });
      socket.on('disconnect', (reason) => {
        this.#connected.set(false);
        if (reason === 'io server disconnect') {
          retry();
        }
      });
      socket.on('connect_error', () => {
        if (!socket.active) {
          retry();
        }
      });
      socket.on('live', (event) => {
        this.#apply(event);
        subscriber.next(event);
      });

      return () => {
        clearTimeout(timer);
        socket.disconnect();
        this.#connected.set(false);
      };
    },
  ).pipe(share());

  async #accessToken(): Promise<string> {
    const scope = getApiScope(this.#clientEnvironment);
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
