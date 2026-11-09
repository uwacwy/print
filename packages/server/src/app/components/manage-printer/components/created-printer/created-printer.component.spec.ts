import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { CreatedPrinterComponent } from './created-printer.component';

describe('CreatedPrinterComponent', () => {
  const create = (serverUrl: string | null) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CreatedPrinterComponent);
    fixture.componentRef.setInput('created', {
      printer: {
        id: 2,
        slug: 'front',
        name: 'Front',
        queue: 'cups://Front',
        coverPage: false,
        lastSeenAt: null,
        activeJobs: 0,
        failedJobs: 0,
        online: false,
        pin: null,
        qrEpoch: 0,
      },
      agentToken: 'a'.repeat(43),
      serverUrl,
    });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the token and commands', () => {
    const el = create('https://print.example.org');
    expect(el.textContent).toContain('a'.repeat(43));
    expect(el.textContent).toContain('agent-front:');
    expect(el.textContent).not.toContain('PUBLIC_URL');
  });

  it('explains missing commands without a server URL', () => {
    expect(create(null).textContent).toContain('PUBLIC_URL');
  });
});
