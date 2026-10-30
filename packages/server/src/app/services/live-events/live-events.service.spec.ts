import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MsalService } from '@azure/msal-angular';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEventsService, parseSseFrames, type LiveEvent } from './live-events.service';

describe('parseSseFrames', () => {
  it('returns complete frames and keeps the partial remainder', () => {
    const { events, rest } = parseSseFrames(
      'retry: 3000\n\nevent: snapshot\ndata: {"type":"snapshot","onlinePrinterIds":[1]}\n\n: ping\n\ndata: {"type":"ag',
    );
    expect(events).toEqual([{ type: 'snapshot', onlinePrinterIds: [1] }]);
    expect(rest).toBe('data: {"type":"ag');
  });
});

describe('LiveEventsService', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(platform = 'browser') {
    const msal = {
      instance: { getActiveAccount: () => ({ homeAccountId: 'a' }), getAllAccounts: () => [] },
      acquireTokenSilent: vi.fn(() => of({ accessToken: 'token-123' })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: MsalService, useValue: msal },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    return { service: TestBed.inject(LiveEventsService), msal };
  }

  it('streams events with the bearer token and tracks online printers', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"snapshot","onlinePrinterIds":[1,2]}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"agent","printerId":2,"online":false,'));
        controller.enqueue(encoder.encode('"lastSeenAt":null}\n\n'));
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { service } = setup();

    const received: LiveEvent[] = [];
    const subscription = service.events.subscribe((event) => received.push(event));
    await vi.waitFor(() => expect(received).toHaveLength(2));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/events');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer token-123');
    expect([...service.onlinePrinterIds()]).toEqual([1]);
    expect(service.connected()).toBe(true);

    subscription.unsubscribe();
    expect(service.connected()).toBe(false);
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it('does not connect during server rendering', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { service } = setup('server');
    service.events.subscribe().unsubscribe();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
