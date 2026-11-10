import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  MsalBroadcastService,
  MsalService,
} from '@azure/msal-angular';
import {
  AccountInfo,
  InteractionStatus,
} from '@azure/msal-browser';
import { filter, map, startWith } from 'rxjs';

/** The signed-in MSAL account, re-read whenever an MSAL interaction finishes. Call in an injection context. */
export const activeAccount = (
  broadcast = inject(MsalBroadcastService),
  msal = inject(MsalService),
): Signal<AccountInfo | null> =>
  toSignal(
    broadcast.inProgress$.pipe(
      filter((status) => status === InteractionStatus.None),
      startWith(InteractionStatus.None),
      map(
        () =>
          msal.instance.getActiveAccount() ??
          msal.instance.getAllAccounts()[0] ??
          null,
      ),
    ),
    { initialValue: null },
  );
