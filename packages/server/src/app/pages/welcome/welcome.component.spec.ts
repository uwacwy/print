import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STATUS_POLL_MS,
  WelcomeComponent,
} from './welcome.component';

describe('WelcomeComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render() {
    const fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = () =>
      element.querySelector('[role="status"]')?.textContent?.trim();
    const state = () =>
      element.querySelector('[data-state]')?.getAttribute('data-state');
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { element, text, state, settle };
  }

  it('shows a loading message until the count arrives', async () => {
    const { text, state } = await render();
    expect(text()).toBe('Checking printers…');
    expect(state()).toBe('checking');
    http.expectOne('/api/status');
  });

  it.each([
    [0, 'idle', 'No printers online right now'],
    [1, 'online', '1 printer online'],
    [3, 'online', '3 printers online'],
  ])(
    'describes %i online printers',
    async (printersOnline, expectedState, message) => {
      const { text, state, settle } = await render();
      http.expectOne('/api/status').flush({ printersOnline });
      await settle();
      expect(text()).toBe(message);
      expect(state()).toBe(expectedState);
    },
  );

  it('reports the server down and offers a retry', async () => {
    const { element, text, state, settle } = await render();
    http
      .expectOne('/api/status')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text()).toBe('The print service is unavailable');
    expect(state()).toBe('down');

    element.querySelector<HTMLButtonElement>('.hero button')!.click();
    TestBed.tick();
    http.expectOne('/api/status').flush({ printersOnline: 2 });
    await settle();
    expect(text()).toBe('2 printers online');
    expect(element.querySelector('.hero button')).toBeNull();
  });

  it('re-checks the server periodically', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { text, settle } = await render();
    http.expectOne('/api/status').flush({ printersOnline: 1 });
    await settle();
    expect(text()).toBe('1 printer online');

    vi.advanceTimersByTime(STATUS_POLL_MS);
    http
      .expectOne('/api/status')
      .flush(null, { status: 0, statusText: 'Network error' });
    await settle();
    expect(text()).toBe('The print service is unavailable');
  });

  it('explains how it works and answers common questions', async () => {
    const { element } = await render();
    http.expectOne('/api/status');
    const headings = [...element.querySelectorAll('h2')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toContain('How this works');
    expect(headings).toContain('Frequently asked questions');
    expect(element.querySelectorAll('.steps li').length).toBe(3);
    expect(
      element.querySelectorAll('details summary').length,
    ).toBeGreaterThan(0);
  });
});
