import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MsalService } from '@azure/msal-angular';
import { LiveEvent } from '@uwacwy/print-shared';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  LiveEventsService,
  SOCKET_IO,
} from './live-events.service';

/** Just enough of a socket.io client socket to drive the service. */
class FakeSocket {
  active = true;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn(() => {
    this.active = false;
  });
  readonly handlers = new Map<
    string,
    (...args: never[]) => void
  >();

  fire(event: string, ...args: unknown[]) {
    (this.handlers.get(event) as (...args: unknown[]) => void)(
      ...args,
    );
  }

  on(event: string, handler: (...args: never[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }
}

describe('LiveEventsService', () => {
  function setup(platform = 'browser') {
    const socket = new FakeSocket();
    const io = vi.fn(() => socket);
    const msal = {
      acquireTokenSilent: vi.fn(() =>
        of({ accessToken: 'token-123' }),
      ),
      instance: {
        getActiveAccount: () => ({ homeAccountId: 'a' }),
        getAllAccounts: () => [],
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: MsalService, useValue: msal },
        { provide: PLATFORM_ID, useValue: platform },
        { provide: SOCKET_IO, useValue: io },
      ],
    });
    return {
      io,
      service: TestBed.inject(LiveEventsService),
      socket,
    };
  }

  it('connects to /live with the MSAL token and tracks online printers', async () => {
    const { io, service, socket } = setup();
    const received: LiveEvent[] = [];
    const subscription = service.events.subscribe((event) =>
      received.push(event),
    );

    const [namespace, options] = io.mock.calls[0] as unknown as [
      string,
      {
        auth: (send: (data: object) => void) => void;
        path: string;
      },
    ];
    expect(namespace).toBe('/live');
    expect(options.path).toBe('/ws');
    const auth = vi.fn();
    options.auth(auth);
    await vi.waitFor(() =>
      expect(auth).toHaveBeenCalledWith({ token: 'token-123' }),
    );

    socket.fire('connect');
    expect(service.connected()).toBe(true);
    socket.fire('live', {
      onlinePrinterIds: [1, 2],
      type: 'snapshot',
    });
    socket.fire('live', {
      lastSeenAt: null,
      online: false,
      printerId: 2,
      type: 'agent',
    });
    expect(received).toHaveLength(2);
    expect([...service.onlinePrinterIds()]).toEqual([1]);

    subscription.unsubscribe();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(service.connected()).toBe(false);
  });

  it('reconnects after the server drops the socket or rejects the handshake', () => {
    vi.useFakeTimers();
    try {
      const { service, socket } = setup();
      const subscription = service.events.subscribe();

      socket.fire('connect');
      socket.fire('disconnect', 'io server disconnect');
      expect(service.connected()).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(socket.connect).toHaveBeenCalledTimes(1);

      socket.active = false;
      socket.fire('connect_error', new Error('Unauthorized'));
      vi.advanceTimersByTime(3000);
      expect(socket.connect).toHaveBeenCalledTimes(2);

      subscription.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not connect during server rendering', () => {
    const { io, service } = setup('server');
    service.events.subscribe().unsubscribe();
    expect(io).not.toHaveBeenCalled();
  });
});
