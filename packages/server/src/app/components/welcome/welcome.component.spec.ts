import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WelcomeComponent } from './welcome.component';

describe('WelcomeComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function render() {
    const fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = () =>
      element.querySelector('[role="status"]')?.textContent?.trim();
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { element, text, settle };
  }

  it('shows a loading message until the count arrives', async () => {
    const { text } = await render();
    expect(text()).toBe('Checking printers…');
    http.expectOne('/api/status');
  });

  it.each([
    [0, 'No printers online.'],
    [1, '1 printer online'],
    [3, '3 printers online'],
  ])(
    'describes %i online printers',
    async (printersOnline, message) => {
      const { text, settle } = await render();
      http.expectOne('/api/status').flush({ printersOnline });
      await settle();
      expect(text()).toBe(message);
    },
  );

  it('offers a retry when the count cannot be loaded', async () => {
    const { element, text, settle } = await render();
    http
      .expectOne('/api/status')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text()).toBe('Unable to check printers.');

    element.querySelector<HTMLButtonElement>('button')!.click();
    TestBed.tick();
    http.expectOne('/api/status').flush({ printersOnline: 2 });
    await settle();
    expect(text()).toBe('2 printers online');
    expect(element.querySelector('button')).toBeNull();
  });
});
