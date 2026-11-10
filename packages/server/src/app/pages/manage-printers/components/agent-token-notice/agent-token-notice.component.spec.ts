import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AgentTokenNoticeComponent } from './agent-token-notice.component';

describe('AgentTokenNoticeComponent', () => {
  const create = () => {
    const fixture = TestBed.createComponent(
      AgentTokenNoticeComponent,
    );
    fixture.componentRef.setInput('printerId', 7);
    fixture.componentRef.setInput('token', 'secret');
    fixture.componentRef.setInput(
      'serverUrl',
      'https://print.example.org',
    );
    fixture.detectChanges();
    return fixture;
  };

  it('shows the token with a copy button and the server URL', () => {
    const el: HTMLElement = create().nativeElement;
    expect(el.querySelector('pre code')?.textContent).toBe(
      'secret',
    );
    expect(el.textContent).toContain('Copy');
    expect(el.textContent).toContain(
      'https://print.example.org',
    );
  });

  it('is labelled by its heading', () => {
    const el: HTMLElement = create().nativeElement;
    expect(
      el
        .querySelector('section')!
        .getAttribute('aria-labelledby'),
    ).toBe('token-heading-7');
    expect(
      el.querySelector('#token-heading-7')?.textContent,
    ).toContain('shown once');
  });

  it('emits dismissed from the Done button', () => {
    const fixture = create();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(
      () => dismissed++,
    );
    Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    )
      .find((b) => b.textContent?.includes('Done'))!
      .click();
    expect(dismissed).toBe(1);
  });
});
