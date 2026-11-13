import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { WelcomeComponent } from './welcome.component';

describe('WelcomeComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function render() {
    const fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('explains how it works and answers common questions', () => {
    const element = render();
    const headings = [...element.querySelectorAll('h2')].map(
      (h) => h.textContent?.trim(),
    );
    expect(headings).toContain('How this works');
    expect(headings).toContain('Frequently asked questions');
    expect(element.querySelectorAll('.steps li').length).toBe(3);
    expect(
      element.querySelectorAll('details summary').length,
    ).toBeGreaterThan(0);
  });
});
