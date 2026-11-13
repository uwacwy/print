import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CreatedPrinterComponent } from './created-printer.component';

describe('CreatedPrinterComponent', () => {
  const create = (serverUrl: null | string) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(
      CreatedPrinterComponent,
    );
    fixture.componentRef.setInput('created', {
      agentToken: 'a'.repeat(43),
      printer: {
        activeJobs: 0,
        coverPage: false,
        failedJobs: 0,
        id: 2,
        lastSeenAt: null,
        name: 'Front',
        online: false,
        pin: null,
        qrEpoch: 0,
        queue: 'cups://Front',
        slug: 'front',
      },
      serverUrl,
    });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the token and commands', () => {
    const el = create('https://print.example.org');
    expect(el.textContent).toContain('a'.repeat(43));
    expect(el.textContent).toContain('agent-front:');
    expect(el.textContent).not.toContain('SITE_URL');
  });

  it('explains missing commands without a server URL', () => {
    expect(create(null).textContent).toContain('SITE_URL');
  });
});
